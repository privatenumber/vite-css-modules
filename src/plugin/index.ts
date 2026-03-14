import path from 'node:path';
import { readFile, writeFile, access } from 'fs/promises';
import type { Plugin, ResolvedConfig, CSSModulesOptions } from 'vite';
import type { TransformPluginContext, ExistingRawSourceMap } from 'rollup';
import { createFilter } from '@rollup/pluginutils';
import MagicString from 'magic-string';
import remapping, { type SourceMapInput } from '@jridgewell/remapping';
import { getTsconfig } from 'get-tsconfig';
import { cssClassPositions } from 'css-class-positions';
import { shouldKeepOriginalExport, getLocalesConventionFunction } from './locals-convention.js';
import { generateEsm, type Imports, type Exports } from './generate-esm.js';
import { generateTypes } from './generate-types.js';
import type { PluginMeta, ExportMode } from './types.js';
import { supportsArbitraryModuleNamespace } from './supports-arbitrary-module-namespace.js';
import type { transform as PostcssTransform } from './transformers/postcss/index.js';
import type { transform as LightningcssTransform } from './transformers/lightningcss.js';
import {
	getCssModuleUrl, cleanUrl, cssModuleRE, slash,
} from './url-utils.js';

export const pluginName = 'vite:css-modules';

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
	 * Generate inline declaration source maps in .d.ts files for CSS modules.
	 * Enables "Go to Definition" to navigate from TypeScript to CSS source.
	 *
	 * When undefined, auto-detects from tsconfig.json's compilerOptions.declarationMap.
	 * Requires generateSourceTypes to be enabled.
	 */
	declarationMap?: boolean;
};

// This plugin is designed to be used by Vite internally
export const cssModules = (
	config: ResolvedConfig,
	patchConfig?: PatchConfig,
	originalCssCache?: Map<string, string>,
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

	let transform: typeof PostcssTransform | typeof LightningcssTransform;

	const exportMode = patchConfig?.exportMode ?? 'both';
	const declarationMap = patchConfig?.declarationMap
		?? getTsconfig(config.root)?.config.compilerOptions?.declarationMap
		?? false;

	/*
	 * Cycle detection for CSS Module `composes` dependencies.
	 *
	 * Problem: when A composes from B, we call context.load(B) which triggers
	 * B's transform. If B composes from A, B's transform calls context.load(A).
	 * But A's transform is already suspended waiting for B — deadlock. Rollup
	 * crashes with a generic "Unexpected early exit" instead of a useful error.
	 *
	 * Solution: track which module→dependency edges are currently in-flight.
	 * Before loading a dependency, walk the active edges to check if it would
	 * create a cycle back to the current module. If so, throw a descriptive
	 * error instead of deadlocking.
	 *
	 * Why shared mutable state (not a passed-through Set): the call chain is
	 * broken by Rollup's plugin pipeline — context.load() triggers a separate
	 * transform invocation, so we can't pass parameters between them. The
	 * activeEdges map is the bridge between independently-invoked transforms.
	 */
	const activeEdges = new Map<string, Set<string>>();

	// DFS through active edges to find a path from fromId back to targetId.
	// Returns the cycle path if found, or undefined if no cycle exists.
	const findCyclePath = (
		fromId: string,
		targetId: string,
		visited = new Set<string>(),
	): string[] | undefined => {
		if (fromId === targetId) {
			return [fromId];
		}
		if (visited.has(fromId)) {
			return;
		}
		visited.add(fromId);

		const dependencies = activeEdges.get(fromId);
		if (!dependencies) {
			return;
		}

		for (const dependencyId of dependencies) {
			const cyclePath = findCyclePath(dependencyId, targetId, visited);
			if (cyclePath) {
				return [fromId, ...cyclePath];
			}
		}
	};

	// Load and return the CSS Module exports from a composed dependency.
	// Called during transform when processing `composes: class from './dep.css'`.
	const loadExports = async (
		context: TransformPluginContext,
		requestId: string,
		fromId: string,
	) => {
		const resolved = await context.resolve(requestId, fromId);
		if (!resolved) {
			throw new Error(`Cannot resolve "${requestId}" from "${fromId}"`);
		}

		const importerId = cleanUrl(fromId);
		const dependencyId = cleanUrl(resolved.id);

		// Check if loading this dependency would create a cycle
		const cyclePath = findCyclePath(dependencyId, importerId);
		if (cyclePath) {
			const formatId = (id: string) => {
				const relativeId = slash(path.relative(config.root, id));
				return JSON.stringify(relativeId || path.basename(id));
			};
			throw new Error(
				`Circular CSS Module dependency: ${[...cyclePath, dependencyId].map(formatId).join(' -> ')}`,
			);
		}

		// Record this edge as active while the dependency loads
		let dependencies = activeEdges.get(importerId);
		if (!dependencies) {
			dependencies = new Set();
			activeEdges.set(importerId, dependencies);
		}
		dependencies.add(dependencyId);

		try {
			const loaded = await context.load({
				id: resolved.id,
			});
			const pluginMeta = loaded.meta[pluginName] as PluginMeta;
			return pluginMeta.exports;
		} finally {
			// Clean up the active edge after load completes (or fails)
			dependencies.delete(dependencyId);
			if (dependencies.size === 0) {
				activeEdges.delete(importerId);
			}
		}
	};

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

			/**
			 * Hook filter to reduce JS/Rust communication overhead in Rolldown
			 * Supported in Vite 6.3.0+ and Rollup 4.38.0+
			 * Backwards-compatible: internal filter check remains for older versions
			 */
			filter: {
				id: cssModuleRE,
			},
			handler: async (id) => {
				if (!filter(id)) {
					return;
				}

				id = id.split('?', 2)[0]!;
				return await readFile(id, 'utf8');
			},
		},

		transform: {
			/**
			 * Hook filter to reduce JS/Rust communication overhead in Rolldown
			 * Supported in Vite 6.3.0+ and Rollup 4.38.0+
			 * Backwards-compatible: internal filter check remains for older versions
			 */
			filter: {
				id: cssModuleRE,
			},
			async handler(inputCss, id) {
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
					slash(cleanUrl(path.relative(config.root, id))),
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

				/**
				 * Passes Promise.all result to Object.fromEntries to preserve export order
				 * This avoids unnecessary git diffs from non-deterministic ordering
				 * (e.g. generated types) when the CSS module itself hasn't changed
				 */
				const exportEntries = await Promise.all(
					Object.entries(cssModule.exports).map(async ([exportName, exported]) => {
						if (
							exportName === 'default'
						&& exportMode === 'both'
						) {
							this.warn('With `exportMode: both`, you cannot use "default" as a class name as it conflicts with the default export. Set `exportMode` to `default` or `named` to use "default" as a class name.');
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
										const loaded = await loadExports(this, getCssModuleUrl(dep.specifier), id);
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

						return [
							exportName,
							{
								code,
								resolved,
								exportAs,
							},
						] as const;
					}),
				);

				const exports: Exports = Object.fromEntries(exportEntries);

				let { map } = cssModule;

				// Inject CSS Modules values
				const references = Object.entries(cssModule.references);
				if (references.length > 0) {
					const ms = new MagicString(outputCss);
					await Promise.all(
						references.map(async ([placeholder, source]) => {
							const loaded = await loadExports(this, getCssModuleUrl(source.specifier), id);
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
							const dtsPath = `${filePath}.d.ts`;
							const originalCss = originalCssCache?.get(filePath);
							const sourceMapOptions = declarationMap && originalCss
								? {
									sourceFileName: path.basename(filePath),
									classPositions: cssClassPositions(originalCss, { fileName: filePath }),
								}
								: undefined;
							const newContent = generateTypes(
								exports, exportMode, allowArbitraryNamedExports, sourceMapOptions,
							);

							// Skip write if content unchanged to avoid triggering file watchers
							const existingContent = await readFile(dtsPath, 'utf8').catch(() => null);
							if (existingContent !== newContent) {
								await writeFile(dtsPath, newContent);
							}
						}
					}
				}

				return {
					code: jsCode,
					map: map ?? { mappings: '' },
					meta: {
						[pluginName]: {
							css: outputCss,
							exports,
						} satisfies PluginMeta,
					},
				};
			},
		},
	};
};
