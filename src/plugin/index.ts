import path from 'node:path';
import { readFile, writeFile, access } from 'fs/promises';
import type { Plugin, ResolvedConfig, CSSModulesOptions } from 'vite';
import type { TransformPluginContext, ExistingRawSourceMap } from 'rollup';
import { createFilter } from '@rollup/pluginutils';
import MagicString from 'magic-string';
import remapping, { type SourceMapInput } from '@ampproject/remapping';
import { shouldKeepOriginalExport, getLocalesConventionFunction } from './locals-convention.js';
import {
	generateEsm, generateTypes, type Imports, type Exports,
} from './generate-esm.js';
import type { PluginMeta, ExportMode, ComposedClassesMode } from './types.js';
import { supportsArbitraryModuleNamespace } from './supports-arbitrary-module-namespace.js';

// https://github.com/vitejs/vite/blob/37af8a7be417f1fb2cf9a0d5e9ad90b76ff211b4/packages/vite/src/node/plugins/css.ts#L185
export const cssModuleRE = /\.module\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

export const pluginName = 'vite:css-modules';

const moduleCssQuery = '?.module.css';
const cleanUrl = (url: string) => (
	url.endsWith(moduleCssQuery)
		? url.slice(0, -moduleCssQuery.length)
		: url
);

const loadExports = async (
	context: TransformPluginContext,
	requestId: string,
	fromId: string,
) => {
	const resolved = await context.resolve(requestId, fromId);
	if (!resolved) {
		throw new Error(`Cannot resolve "${requestId}" from "${fromId}"`);
	}
	const loaded = await context.load({
		id: resolved.id,
	});
	const pluginMeta = loaded.meta[pluginName] as PluginMeta;
	return pluginMeta.exports;
};

export type PatchConfig = {

	/**
	 * Specifies the export method for CSS Modules.
	 *
	 * - 'both': Export both default and named exports.
	 * - 'default': Export only the default export.
	 * - 'named': Export only named exports.
	 *
	 * @default 'both'
	 */
	exportMode?: ExportMode;

	/**
	 * Generate TypeScript declaration (.d.ts) files for CSS modules
	 *
	 * For example, importing `style.module.css` will create a `style.module.css.d.ts` file
	 * next to it, containing type definitions for the exported CSS class names
	 */
	generateSourceTypes?: boolean;

	/**
	 * Choose how to output composed classes.
	 *
	 * - 'string': space separated string
	 * - 'array': composed classes as arrays of strings
	 * - 'all-array': all classes as arrays of strings
	 */
	composedClasses?: ComposedClassesMode;
};

// This plugin is designed to be used by Vite internally
export const cssModules = (
	config: ResolvedConfig,
	patchConfig?: PatchConfig,
): Plugin => {
	const filter = createFilter(cssModuleRE);
	const allowArbitraryNamedExports = supportsArbitraryModuleNamespace(config);

	const cssConfig = config.css;
	const cssModuleConfig: CSSModulesOptions = { ...cssConfig.modules };
	const lightningCssOptions = { ...cssConfig.lightningcss };
	const { devSourcemap } = cssConfig;

	const isLightningCss = cssConfig.transformer === 'lightningcss';
	const loadTransformer = (
		isLightningCss
			? import('./transformers/lightningcss.js')
			: import('./transformers/postcss/index.js')
	);

	let transform: (
		typeof import('./transformers/postcss/index.js').transform
		| typeof import('./transformers/lightningcss.js').transform
	);

	const exportMode = patchConfig?.exportMode ?? 'both';

	let isVitest = false;

	return {
		name: pluginName,
		buildStart: async () => {
			const transformer = await loadTransformer;
			transform = transformer.transform;
		},
		load: {
			// Fallback load from disk in case it can't be loaded by another plugin (e.g. vue)
			order: 'post',
			handler: async (id) => {
				if (!filter(id)) {
					return;
				}

				id = id.split('?', 2)[0]!;
				return await readFile(id, 'utf8');
			},
		},

		async transform(inputCss, id) {
			if (!filter(id)) {
				return;
			}

			/**
			 * Handle Vitest disabling CSS
			 * https://github.com/vitest-dev/vitest/blob/v2.1.8/packages/vitest/src/node/plugins/cssEnabler.ts#L55-L68
			 */
			if (inputCss === '') {
				if (!isVitest) {
					const checkVitest = config.plugins.some(plugin => plugin.name === 'vitest:css-disable');
					if (checkVitest) {
						isVitest = true;
					}
				}
				if (isVitest) {
					return {
						code: 'export default {};',
						map: null,
					};
				}
			}

			const cssModule = transform(
				inputCss,

				/**
				 * Relative path from project root to get stable CSS modules hash
				 * https://github.com/vitejs/vite/blob/57463fc53fedc8f29e05ef3726f156a6daf65a94/packages/vite/src/node/plugins/css.ts#L2690
				 */
				cleanUrl(path.relative(config.root, id)),
				isLightningCss ? lightningCssOptions : cssModuleConfig,
				devSourcemap,
			);

			let outputCss = cssModule.code;
			const imports: Imports = new Map();
			let counter = 0;

			const keepOriginalExport = shouldKeepOriginalExport(cssModuleConfig);
			const localsConventionFunction = getLocalesConventionFunction(cssModuleConfig);

			const registerImport = (
				fromFile: string,
				exportName?: string,
			) => {
				let importFrom = imports.get(fromFile);
				if (!importFrom) {
					importFrom = {};
					imports.set(fromFile, importFrom);
				}

				if (!exportName) {
					return;
				}

				if (!importFrom[exportName]) {
					importFrom[exportName] = `_${counter}`;
					counter += 1;
				}
				return importFrom[exportName];
			};

			const exports: Exports = {};

			await Promise.all(
				Object.entries(cssModule.exports).map(async ([exportName, exported]) => {
					if (
						exportName === 'default'
						&& exportMode !== 'named'
					) {
						this.warn('You cannot use "default" as a class name as it conflicts with the default export. Set "exportMode: named" to use "default" as a class name.');
					}

					const exportAs = new Set<string>();
					if (keepOriginalExport) {
						exportAs.add(exportName);
					}

					let code: string;
					let resolved: string;
					if (typeof exported === 'string') {
						const transformedExport = localsConventionFunction?.(exportName, exportName, id);
						if (transformedExport) {
							exportAs.add(transformedExport);
						}
						code = exported;
						resolved = exported;
					} else {
						const transformedExport = localsConventionFunction?.(exportName, exported.name, id);
						if (transformedExport) {
							exportAs.add(transformedExport);
						}

						// Collect composed classes
						const composedClasses = await Promise.all(
							exported.composes.map(async (dep) => {
								if (dep.type === 'dependency') {
									const loaded = await loadExports(this, `${dep.specifier}${moduleCssQuery}`, id);
									const exportedEntry = loaded[dep.name]!;
									if (!exportedEntry) {
										throw new Error(`Cannot resolve ${JSON.stringify(dep.name)} from ${JSON.stringify(dep.specifier)}`);
									}
									const [exportAsName] = Array.from(exportedEntry.exportAs);
									const importedAs = registerImport(dep.specifier, exportAsName)!;
									return {
										resolved: exportedEntry.resolved,
										code: `\${${importedAs}}`,
									};
								}

								return {
									resolved: dep.name,
									code: dep.name,
								};
							}),
						);
						code = [exported.name, ...composedClasses.map(c => c.code)].join(' ');
						resolved = [exported.name, ...composedClasses.map(c => c.resolved)].join(' ');
					}

					exports[exportName] = {
						code,
						resolved,
						exportAs,
					};
				}),
			);

			let { map } = cssModule;

			// Inject CSS Modules values
			const references = Object.entries(cssModule.references);
			if (references.length > 0) {
				const ms = new MagicString(outputCss);
				await Promise.all(
					references.map(async ([placeholder, source]) => {
						const loaded = await loadExports(this, `${source.specifier}${moduleCssQuery}`, id);
						const exported = loaded[source.name];
						if (!exported) {
							throw new Error(`Cannot resolve "${source.name}" from "${source.specifier}"`);
						}

						registerImport(source.specifier);
						ms.replaceAll(placeholder, exported.code);
					}),
				);
				outputCss = ms.toString();

				if (map) {
					const newMap = remapping(
						[
							ms.generateMap({
								source: id,
								file: id,
								includeContent: true,
							}),
							map,
						] as SourceMapInput[],
						() => null,
					) as ExistingRawSourceMap;

					map = newMap;
				}
			}

			if (
				'getJSON' in cssModuleConfig
				&& typeof cssModuleConfig.getJSON === 'function'
			) {
				const json: Record<string, string> = {};
				for (const exported of Object.values(exports)) {
					for (const exportAs of exported.exportAs) {
						json[exportAs] = exported.resolved;
					}
				}

				cssModuleConfig.getJSON(id, json, id);
			}

			const jsCode = generateEsm(
				imports,
				exports,
				exportMode,
				allowArbitraryNamedExports,
			);

			if (patchConfig?.generateSourceTypes) {
				const filePath = id.split('?', 2)[0];

				// Only generate types for importable module files
				if (filePath && cssModuleRE.test(filePath)) {
					const fileExists = await access(filePath).then(() => true, () => false);
					if (fileExists) {
						await writeFile(
							`${id}.d.ts`,
							generateTypes(exports, allowArbitraryNamedExports),
						);
					}
				}
			}

			return {
				code: jsCode,
				map,
				meta: {
					[pluginName]: {
						css: outputCss,
						exports,
					} satisfies PluginMeta,
				},
			};
		},
	};
};
