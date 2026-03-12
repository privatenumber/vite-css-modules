import fs from 'node:fs/promises';
import path from 'node:path';
import { cssClassPositions } from 'css-class-positions';
import { preprocessCSS } from 'vite';
import type { SourceMapOptions } from '../plugin/generate-dts-sourcemap.js';
import { getLocalesConventionFunction, shouldKeepOriginalExport } from '../plugin/locals-convention.js';
import type { Exports } from '../plugin/generate-esm.js';
import type { CSSModuleReferences } from '../plugin/transformers/postcss/types.js';
import { transform as postcssTransform } from '../plugin/transformers/postcss/index.js';
import { transform as lightningcssTransform } from '../plugin/transformers/lightningcss.js';
import { cleanUrl, getCssModuleUrl } from '../plugin/url-utils.js';
import type { ProjectContext } from './project-context.js';
import { cssModuleExportsToExports } from './css-module-exports-to-exports.js';
import {
	createDebug,
	formatDebugPath,
	formatDurationMs,
} from './debug.js';

type LoadedCssModule = {
	exports: Exports;
	references: CSSModuleReferences;
	sourceMapOptions?: SourceMapOptions;
};

type CachedCssModule = {
	exports: Exports;
	originalCode: string;
	references: CSSModuleReferences;
};

const stripQuery = (id: string) => id.split('?', 2)[0]!;
const stripModuleSuffix = (filePath: string) => filePath.replace(/\.module(?=\.)/, '');
const debugTransform = createDebug('vite-css-modules:transform');
const debugResolve = createDebug('vite-css-modules:resolve');

const transformCssModule = (
	inputCss: string,
	filePath: string,
	context: ProjectContext,
) => {
	const id = cleanUrl(path.relative(context.resolvedConfig.root, filePath));
	if (context.resolvedConfig.css.transformer === 'lightningcss') {
		return lightningcssTransform(
			inputCss,
			id,
			context.resolvedConfig.css.lightningcss ?? {},
			false,
		);
	}

	return postcssTransform(
		inputCss,
		id,
		context.cssModulesConfig,
		false,
	);
};

const resolveDependency = async (
	specifier: string,
	fromFile: string,
	context: ProjectContext,
) => {
	const resolver = context.resolvedConfig.createResolver();
	const resolveStart = performance.now();
	debugResolve('resolving dependency', {
		fromFile: formatDebugPath(fromFile),
		specifier,
	});
	const resolved = await resolver(getCssModuleUrl(specifier), fromFile);

	if (!resolved) {
		throw new Error(`Cannot resolve ${JSON.stringify(specifier)} from ${JSON.stringify(fromFile)}`);
	}

	debugResolve('resolved dependency', {
		durationMs: formatDurationMs(performance.now() - resolveStart),
		fromFile: formatDebugPath(fromFile),
		resolved: formatDebugPath(resolved),
		specifier,
	});
	return stripQuery(cleanUrl(resolved));
};

export const createCssModuleLoader = (
	context: ProjectContext,
) => {
	const cache = new Map<string, Promise<CachedCssModule>>();
	const keepOriginalExport = shouldKeepOriginalExport(context.cssModulesConfig);
	const localsConventionFunction = getLocalesConventionFunction(context.cssModulesConfig);

	const loadCssModule = async (
		filePath: string,
		options?: {
			includeSourceMap?: boolean;
		},
	): Promise<LoadedCssModule> => {
		let cached = cache.get(filePath);
			if (!cached) {
				cached = (async () => {
					const fileStart = performance.now();
					const readStart = performance.now();
					debugTransform('reading css module', formatDebugPath(filePath));
					const code = await fs.readFile(filePath, 'utf8');
					debugTransform('read css module', {
						durationMs: formatDurationMs(performance.now() - readStart),
						filePath: formatDebugPath(filePath),
					});
					const preprocessStart = performance.now();
					debugTransform('preprocessing css module', formatDebugPath(filePath));
					const processed = await preprocessCSS(
						code,
						stripModuleSuffix(filePath),
						context.resolvedConfig,
					);
					debugTransform('preprocessed css module', {
						durationMs: formatDurationMs(performance.now() - preprocessStart),
						filePath: formatDebugPath(filePath),
					});
					const transformStart = performance.now();
					debugTransform('transforming css module', {
						filePath: formatDebugPath(filePath),
						root: formatDebugPath(context.resolvedConfig.root),
						transformer: context.resolvedConfig.css.transformer,
					});
					const cssModule = transformCssModule(processed.code, filePath, context);
					const resolvedDependencies = new Map<string, string>();
					debugTransform('loaded css module exports', {
						durationMs: formatDurationMs(performance.now() - transformStart),
						exports: Object.keys(cssModule.exports),
						filePath: formatDebugPath(filePath),
					});
					const dependencyResolutionStart = performance.now();

					for (const exported of Object.values(cssModule.exports)) {
					if (typeof exported === 'string') {
						continue;
					}

					for (const composed of exported.composes) {
						if (composed.type !== 'dependency') {
							continue;
						}

							const dependencyFile = await resolveDependency(
								composed.specifier,
								filePath,
								context,
							);
							debugResolve('resolved compose dependency', {
								dependencyFile: formatDebugPath(dependencyFile),
								exportedFrom: formatDebugPath(filePath),
								name: composed.name,
								specifier: composed.specifier,
							});
							const dependencyModule = await loadCssModule(dependencyFile);
							debugResolve('compose export lookup', {
								availableExports: Object.keys(dependencyModule.exports),
								dependencyFile: formatDebugPath(dependencyFile),
								name: composed.name,
							});
							const dependencyExport = dependencyModule.exports[composed.name];
							if (!dependencyExport) {
							throw new Error(`Cannot resolve ${JSON.stringify(composed.name)} from ${JSON.stringify(composed.specifier)}`);
						}
						resolvedDependencies.set(
							`${composed.specifier}\0${composed.name}`,
							dependencyExport.resolved,
						);
					}
				}

				for (const reference of Object.values(cssModule.references)) {
						const dependencyFile = await resolveDependency(
							reference.specifier,
							filePath,
							context,
						);
						debugResolve('resolved value dependency', {
							dependencyFile: formatDebugPath(dependencyFile),
							exportedFrom: formatDebugPath(filePath),
							name: reference.name,
							specifier: reference.specifier,
						});
						const dependencyModule = await loadCssModule(dependencyFile);
						debugResolve('value export lookup', {
							availableExports: Object.keys(dependencyModule.exports),
							dependencyFile: formatDebugPath(dependencyFile),
							name: reference.name,
						});
						if (!dependencyModule.exports[reference.name]) {
							throw new Error(`Cannot resolve ${JSON.stringify(reference.name)} from ${JSON.stringify(reference.specifier)}`);
						}
					}
					debugTransform('resolved dependencies', {
						durationMs: formatDurationMs(performance.now() - dependencyResolutionStart),
						filePath: formatDebugPath(filePath),
					});
					debugTransform('compiled css module', {
						durationMs: formatDurationMs(performance.now() - fileStart),
						filePath: formatDebugPath(filePath),
					});

					return {
					exports: cssModuleExportsToExports(
						cssModule.exports,
						filePath,
						keepOriginalExport,
						localsConventionFunction,
						composition => (
							composition.type === 'dependency'
								? resolvedDependencies.get(`${composition.specifier}\0${composition.name}`)
								: composition.name
						),
					),
					originalCode: code,
					references: cssModule.references,
				};
			})();
			cache.set(filePath, cached);
		}

			const cssModule = await cached;
			const sourceMapStart = performance.now();
			const sourceMapOptions = (
				options?.includeSourceMap
				&& context.declarationMap
			)
				? {
					sourceFileName: path.basename(filePath),
					classPositions: cssClassPositions(cssModule.originalCode, { fileName: filePath }),
				}
				: undefined;
			if (sourceMapOptions) {
				debugTransform('generated declaration map inputs', {
					durationMs: formatDurationMs(performance.now() - sourceMapStart),
					filePath: formatDebugPath(filePath),
				});
			}
			return {
				exports: cssModule.exports,
				references: cssModule.references,
				sourceMapOptions,
			};
		};

	return loadCssModule;
};
