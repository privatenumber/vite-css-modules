import path from 'node:path';
import { readFile } from 'fs/promises';
import type { Plugin, ResolvedConfig } from 'vite';
import type { TransformPluginContext } from 'rollup';
import { createFilter } from '@rollup/pluginutils';
import { generateEsm, type Imports, type Exports } from './generate-esm.js';

// https://github.com/vitejs/vite/blob/37af8a7be417f1fb2cf9a0d5e9ad90b76ff211b4/packages/vite/src/node/plugins/css.ts#L185
export const cssModuleRE = /\.module\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

export const pluginName = 'vite:css-modules';

const postfixRE = /[?#].*$/;
const cleanUrl = (url: string): string => url.replace(postfixRE, '');

// This plugin is designed to be used by Vite internally
export const cssModules = (
	config: ResolvedConfig,
): Plugin => {
	const filter = createFilter(cssModuleRE);

	let transform: (
		typeof import('./transformers/postcss/index.js').transform
		| typeof import('./transformers/lightningcss.js').transform
	);

	const cssConfig = config.css;
	const lightningCssOptions = { ...cssConfig.lightningcss };

	const isLightningCss = cssConfig.transformer === 'lightningcss';
	const cssModuleConfig = {
		...(
			isLightningCss
				? lightningCssOptions.cssModules
				: cssConfig.modules
		),
	};

	if (cssModuleConfig === false) {
		return {
			name: pluginName,
		};
	}

	const loadTransformer = (
		isLightningCss
			? import('./transformers/lightningcss.js')
			: import('./transformers/postcss/index.js')
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
		return loaded.meta[pluginName].exports as Exports;
	};

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

			const cssModule = transform(
				inputCss,

				// https://github.com/vitejs/vite/blob/57463fc53fedc8f29e05ef3726f156a6daf65a94/packages/vite/src/node/plugins/css.ts#L2690
				cleanUrl(path.relative(config.root, id)),
				cssModuleConfig,
				lightningCssOptions,
			);

			let outputCss = cssModule.code;
			const imports: Imports = new Map();
			let counter = 0;

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

			for (const [exportName, exported] of Object.entries(cssModule.exports)) {
				if (typeof exported === 'string') {
					exports[exportName] = exported;
				} else {
					exports[exportName] = [
						exported.name,

						// Collect composed classes
						...exported.composes.map((dep) => {
							if (dep.type === 'dependency') {
								const importedAs = registerImport(dep.specifier, dep.name)!;
								return `\${${importedAs}}`;
							}

							return dep.name;
						}),
					].join(' ');
				}
			}

			await Promise.all(
				Object.entries(cssModule.references).map(async ([placeholder, source]) => {
					const loaded = await loadExports(this, `${source.specifier}?.module.css`, id);
					const importValue = loaded[source.name];
					if (!importValue) {
						throw new Error(`Cannot resolve "${source.name}" from "${source.specifier}"`);
					}

					registerImport(source.specifier);
					outputCss = outputCss.replaceAll(placeholder, importValue);
				}),
			);

			const jsCode = generateEsm(imports, exports);

			return {
				code: jsCode,
				map: { mappings: '' },
				meta: {
					[pluginName]: {
						css: outputCss,
						exports,
					},
				},
			};
		},
	};
};
