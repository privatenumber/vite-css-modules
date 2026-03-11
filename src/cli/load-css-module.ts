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
import { withProcessCwd, type ProjectContext } from './project-context.js';
import { cssModuleExportsToExports } from './css-module-exports-to-exports.js';

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
const debugLog = (...values: unknown[]) => {
	if (process.env.VITE_CSS_MODULES_CLI_DEBUG) {
		console.error('[vite-css-modules:cli]', ...values);
	}
};

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
	const resolved = await withProcessCwd(
		context.invocationCwd,
		async () => resolver(getCssModuleUrl(specifier), fromFile),
	);

	if (!resolved) {
		throw new Error(`Cannot resolve ${JSON.stringify(specifier)} from ${JSON.stringify(fromFile)}`);
	}

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
				const code = await fs.readFile(filePath, 'utf8');
				const processed = await withProcessCwd(
					context.invocationCwd,
					async () => preprocessCSS(
						code,
						stripModuleSuffix(filePath),
						context.resolvedConfig,
					),
				);
				const cssModule = transformCssModule(processed.code, filePath, context);
				const resolvedDependencies = new Map<string, string>();
				debugLog('loaded', filePath, Object.keys(cssModule.exports));

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
						debugLog('resolved compose dependency', composed.specifier, dependencyFile);
						const dependencyModule = await loadCssModule(dependencyFile);
						debugLog('compose export lookup', composed.name, Object.keys(dependencyModule.exports));
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
					debugLog('resolved value dependency', reference.specifier, dependencyFile);
					const dependencyModule = await loadCssModule(dependencyFile);
					debugLog('value export lookup', reference.name, Object.keys(dependencyModule.exports));
					if (!dependencyModule.exports[reference.name]) {
						throw new Error(`Cannot resolve ${JSON.stringify(reference.name)} from ${JSON.stringify(reference.specifier)}`);
					}
				}

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
		return {
			exports: cssModule.exports,
			references: cssModule.references,
			sourceMapOptions: (
				options?.includeSourceMap
				&& context.declarationMap
			)
				? {
					sourceFileName: path.basename(filePath),
					classPositions: cssClassPositions(cssModule.originalCode, { fileName: filePath }),
				}
				: undefined,
		};
	};

	return loadCssModule;
};
