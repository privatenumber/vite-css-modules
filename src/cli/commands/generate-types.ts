import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { glob } from 'tinyglobby';
import { green, red, yellow } from 'yoctocolors';
import { up } from 'empathic/find';
import type { Exports } from '../../plugin/generate-esm.js';
import type { ExportMode } from '../../plugin/types.js';
import { generateTypes } from '../../plugin/generate-types.js';
import { transform } from '../../plugin/transformers/postcss/index.js';
import { shouldKeepOriginalExport, getLocalesConventionFunction } from '../../plugin/locals-convention.js';
import { targetSupportsArbitraryModuleNamespace } from '../../plugin/supports-arbitrary-module-namespace.js';

const successIcon = green('✔');
const failureIcon = red('✖');
const warningIcon = yellow('⚠');

type LocalsConvention = 'camelCase' | 'camelCaseOnly' | 'dashes' | 'dashesOnly';

type Options = {
	exportMode: ExportMode;
	localsConvention?: LocalsConvention;
	target?: string;
};

const preprocessorExtensions = new Set(['.scss', '.sass', '.less', '.styl', '.stylus']);
const sassExtensions = new Set(['.scss', '.sass']);

type Result = {
	file: string;
	dtsPath: string;
} | {
	file: string;
	error: string;
	errorType: 'sass-not-found' | 'preprocessor' | 'other';
};

type SassCompiler = {
	compileString: (
		source: string,
		options?: {
			syntax?: 'scss' | 'indented';
			url?: URL;
			loadPaths?: string[];
		},
	) => { css: string };
};

// Cache sass compilers by package.json location
const sassCache = new Map<string, SassCompiler | null>();

const tryImportSass = (
	packageJsonPath: string,
): SassCompiler | undefined => {
	const cached = sassCache.get(packageJsonPath);
	if (cached !== undefined) {
		return cached ?? undefined;
	}

	try {
		const require = createRequire(packageJsonPath);
		// Try sass-embedded first (faster), then sass
		let compiler: SassCompiler;
		try {
			compiler = require('sass-embedded') as SassCompiler;
		} catch {
			compiler = require('sass') as SassCompiler;
		}
		sassCache.set(packageJsonPath, compiler);
		return compiler;
	} catch {
		sassCache.set(packageJsonPath, null);
		return undefined;
	}
};

export const generateTypesCommand = async (
	directories: string[],
	options: Options,
) => {
	const files = await glob(
		directories.map(
			directory => path.posix.join(directory, '**/*.module.{css,scss,sass,less,styl,stylus,pcss,postcss}'),
		),
		{
			ignore: [
				'**/node_modules/**',
				'**/dist/**',
				'**/build/**',
				'**/.git/**',
				'**/coverage/**',
			],
		},
	);

	if (files.length === 0) {
		console.log('No CSS Modules found');
		return;
	}

	files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

	console.log(`Found ${files.length} CSS Module(s)\n`);

	const { exportMode, localsConvention, target } = options;

	const cssModulesOptions = localsConvention ? { localsConvention } : {};
	const keepOriginalExport = shouldKeepOriginalExport(cssModulesOptions);
	const localsConventionFunction = getLocalesConventionFunction(cssModulesOptions);

	const allowArbitraryNamedExports = target
		? targetSupportsArbitraryModuleNamespace(target)
		: false;

	const results = await Promise.all(
		files.map(async (file): Promise<Result> => {
			const moduleExtension = file.match(/\.module\.(\w+)$/)?.[1] ?? '';
			const isSassFile = sassExtensions.has(`.${moduleExtension}`);
			let sassNotFound = false;

			try {
				let code = await fs.readFile(file, 'utf8');

				// Compile SCSS/Sass if compiler is available
				if (isSassFile) {
					const packageJsonPath = up('package.json', { cwd: path.dirname(file) });
					const sass = packageJsonPath ? tryImportSass(packageJsonPath) : undefined;

					if (sass) {
						const absolutePath = path.resolve(file);
						const result = sass.compileString(code, {
							syntax: moduleExtension === 'sass' ? 'indented' : 'scss',
							url: new URL(`file://${absolutePath}`),
							loadPaths: [path.dirname(absolutePath)],
						});
						code = result.css;
					} else {
						// No sass compiler - strip // comments as a fallback
						// This handles SCSS files that only use // comments without other SCSS features
						code = code
							.replace(/^\s*\/\/.*$/gm, '') // Lines that are only comments
							.replace(/([;{}])\s*\/\/.*$/gm, '$1'); // Inline comments after ; or {}
						sassNotFound = true;
					}
				}

				const { exports: cssExports } = transform(code, file, cssModulesOptions);

				const exportNames: Exports = Object.fromEntries(
					Object.entries(cssExports).map(([exportName, exported]) => {
						const exportAs = new Set<string>();

						if (keepOriginalExport) {
							exportAs.add(exportName);
						}

						const className = typeof exported === 'string' ? exportName : exported.name;
						const transformedExport = localsConventionFunction?.(exportName, className, file);
						if (transformedExport) {
							exportAs.add(transformedExport);
						}

						return [exportName, {
							exportAs,
							code: '',
							resolved: '',
						}];
					}),
				);

				const dtsContent = generateTypes(
					exportNames,
					exportMode,
					allowArbitraryNamedExports,
				);

				const dtsPath = `${file}.d.ts`;
				await fs.writeFile(dtsPath, dtsContent, 'utf8');
				return { file, dtsPath };
			} catch (error) {
				let errorType: 'sass-not-found' | 'preprocessor' | 'other';
				if (sassNotFound) {
					errorType = 'sass-not-found';
				} else if (preprocessorExtensions.has(`.${moduleExtension}`)) {
					errorType = 'preprocessor';
				} else {
					errorType = 'other';
				}
				return {
					file,
					error: error instanceof Error ? error.message : String(error),
					errorType,
				};
			}
		}),
	);

	// Print results in sorted order
	for (const result of results) {
		if ('dtsPath' in result) {
			console.log(result.dtsPath);
		}
	}

	const failedFiles = results.filter((r): r is Result & { error: string; errorType: string } => 'error' in r);

	if (failedFiles.length > 0) {
		const sassNotFoundFailures = failedFiles.filter(f => f.errorType === 'sass-not-found');
		const preprocessorFailures = failedFiles.filter(f => f.errorType === 'preprocessor');
		const otherFailures = failedFiles.filter(f => f.errorType === 'other');

		console.error(`\n${failureIcon} Failed to generate types for ${failedFiles.length} file(s)`);
		process.exitCode = 1;

		if (sassNotFoundFailures.length > 0) {
			console.error(`\n${warningIcon} ${sassNotFoundFailures.length} file(s) missing sass compiler:`);
			for (const { file, error } of sassNotFoundFailures) {
				console.error(`  - ${file}`);
				console.error(`    ${error}`);
			}
			console.error('\n  Install `sass` or `sass-embedded` in the package containing these files.');
		}

		if (preprocessorFailures.length > 0) {
			console.error(`\n${warningIcon} ${preprocessorFailures.length} file(s) with preprocessor syntax errors:`);
			for (const { file, error } of preprocessorFailures) {
				console.error(`  - ${file}`);
				console.error(`    ${error}`);
			}
			console.error('\n  These files may use syntax that failed to compile (e.g. invalid SCSS).');
		}

		if (otherFailures.length > 0) {
			console.error(`\n${otherFailures.length} file(s) with other errors:`);
			for (const { file, error } of otherFailures) {
				console.error(`  - ${file}`);
				console.error(`    ${error}`);
			}
		}
	} else {
		console.log(`\n${successIcon} Successfully generated types for ${files.length} CSS Module(s)`);
	}
};
