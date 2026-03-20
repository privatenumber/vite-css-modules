import fs from 'node:fs/promises';
import path from 'node:path';
import { cssClassPositions } from 'css-class-positions';
import { preprocessCSS } from 'vite';
import type { SourceMapOptions } from '../plugin/generate-dts-sourcemap.js';
import { getLocalesConventionFunction, shouldKeepOriginalExport } from '../plugin/locals-convention.js';
import type { Exports } from '../plugin/generate-esm.js';
import { transform as postcssTransform } from '../plugin/transformers/postcss/index.js';
import { transform as lightningcssTransform } from '../plugin/transformers/lightningcss.js';
import { cleanUrl, getCssModuleUrl } from '../plugin/url-utils.js';
import type { ProjectContext } from './project-context.js';
import { cssModuleExportsToExports } from './css-module-exports-to-exports.js';

export const createCssModuleLoader = (
	context: ProjectContext,
) => {
	const cache = new Map<string, Promise<{
		exports: Exports;
		originalCode: string;
	}>>();
	const keepOriginalExport = shouldKeepOriginalExport(context.cssModulesConfig);
	const localsConventionFunction = getLocalesConventionFunction(context.cssModulesConfig);
	const resolve = context.resolvedConfig.createResolver();

	const resolveDependency = async (
		specifier: string,
		fromFile: string,
	) => {
		const resolved = await resolve(getCssModuleUrl(specifier), fromFile);
		if (!resolved) {
			throw new Error(`Cannot resolve ${JSON.stringify(specifier)} from ${JSON.stringify(fromFile)}`);
		}
		return cleanUrl(resolved).split('?', 2)[0]!;
	};

	const transformCssModule = async (
		filePath: string,
		sourceCode?: string,
	) => {
		const code = sourceCode ?? await fs.readFile(filePath, 'utf8');

		const processed = await preprocessCSS(
			code,
			filePath.replace(/\.module(?=\.)/, ''),
			context.resolvedConfig,
		);

		const id = cleanUrl(path.relative(context.resolvedConfig.root, filePath));
		const cssModule = context.resolvedConfig.css.transformer === 'lightningcss'
			? lightningcssTransform(
				processed.code,
				id,
				context.resolvedConfig.css.lightningcss ?? {},
				false,
			)
			: postcssTransform(
				processed.code,
				id,
				context.cssModulesConfig,
				false,
			);

		const resolvedDependencies = new Map<string, string>();

		await Promise.all([
			...Object.values(cssModule.exports).flatMap((exported) => {
				if (typeof exported === 'string') {
					return [];
				}
				return exported.composes
					.filter(composed => composed.type === 'dependency')
					.map(async (composed) => {
						const dependencyFile = await resolveDependency(composed.specifier, filePath);
						const dependencyModule = await loadCssModule(dependencyFile);
						const dependencyExport = dependencyModule.exports[composed.name];
						if (!dependencyExport) {
							throw new Error(`Cannot resolve ${JSON.stringify(composed.name)} from ${JSON.stringify(composed.specifier)}`);
						}
						resolvedDependencies.set(
							`${composed.specifier}\0${composed.name}`,
							dependencyExport.resolved,
						);
					});
			}),
			...Object.values(cssModule.references).map(async (reference) => {
				const dependencyFile = await resolveDependency(reference.specifier, filePath);
				const dependencyModule = await loadCssModule(dependencyFile);
				if (!dependencyModule.exports[reference.name]) {
					throw new Error(`Cannot resolve ${JSON.stringify(reference.name)} from ${JSON.stringify(reference.specifier)}`);
				}
			}),
		]);

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
		};
	};

	const loadCssModule = async (
		filePath: string,
		includeSourceMap = false,
		sourceCode?: string,
	): Promise<{
		exports: Exports;
		sourceMapOptions?: SourceMapOptions;
	}> => {
		let cached = cache.get(filePath);
		if (!cached) {
			cached = transformCssModule(filePath, sourceCode);
			cache.set(filePath, cached);
		}

		const cssModule = await cached;
		const sourceMapOptions = includeSourceMap && context.declarationMap
			? {
				sourceFileName: path.basename(filePath),
				classPositions: cssClassPositions(cssModule.originalCode, { fileName: filePath }),
			}
			: undefined;

		return {
			exports: cssModule.exports,
			sourceMapOptions,
		};
	};

	return loadCssModule;
};
