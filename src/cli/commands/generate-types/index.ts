import fs from 'node:fs/promises';
import path from 'node:path';
import { command } from 'cleye';
import { glob } from 'tinyglobby';
import { green, red, yellow } from 'yoctocolors';
import type { Exports } from '../../../plugin/generate-esm.js';
import { generateTypes } from '../../../plugin/generate-types.js';
import { transform } from '../../../plugin/transformers/postcss/index.js';
import { shouldKeepOriginalExport, getLocalesConventionFunction } from '../../../plugin/locals-convention.js';
import { targetSupportsArbitraryModuleNamespace } from '../../../plugin/supports-arbitrary-module-namespace.js';
import { compileSass } from './sass.js';

const successIcon = green('✔');
const failureIcon = red('✖');
const warningIcon = yellow('⚠');

const exportModes = ['both', 'named', 'default'] as const;
const localsConventions = ['camelCase', 'camelCaseOnly', 'dashes', 'dashesOnly'] as const;

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

export const generateTypesCommand = command({
	name: 'generate-types',

	parameters: [
		'[directories...]',
	],

	flags: {
		exportMode: {
			type: String,
			alias: 'e',
			description: `Export style: ${exportModes.join(', ')} (default: both)`,
		},
		localsConvention: {
			type: String,
			alias: 'l',
			description: `Class name transformation: ${localsConventions.join(', ')}`,
		},
		target: {
			type: String,
			description: 'Build target for arbitrary module namespace (e.g. es2022, esnext, chrome90)',
		},
	},

	help: {
		description: 'Generate TypeScript declaration files for CSS Modules',
	},
}, async (argv) => {
	const directories = (
		argv._.directories && argv._.directories.length > 0
			? argv._.directories
			: [process.cwd()]
	);

	const { exportMode, localsConvention, target } = argv.flags;

	if (exportMode && !exportModes.includes(exportMode as typeof exportModes[number])) {
		throw new Error(`Invalid --export-mode: ${exportMode}. Must be one of: ${exportModes.join(', ')}`);
	}

	if (
		localsConvention
		&& !localsConventions.includes(localsConvention as typeof localsConventions[number])
	) {
		throw new Error(`Invalid --locals-convention: ${localsConvention}. Must be one of: ${localsConventions.join(', ')}`);
	}

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

	files.sort((a, b) => (a < b ? -1 : (a > b ? 1 : 0)));

	console.log(`Found ${files.length} CSS Module(s)\n`);

	const validatedExportMode = (exportMode as typeof exportModes[number]) ?? 'both';
	const validatedLocalsConvention = localsConvention as typeof localsConventions[number];

	const cssModulesOptions = validatedLocalsConvention ? { localsConvention: validatedLocalsConvention } : {};
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
					const result = compileSass(
						code,
						file,
						moduleExtension === 'sass' ? 'indented' : 'scss',
					);
					code = result.code;
					sassNotFound = result.sassNotFound;
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
					validatedExportMode,
					allowArbitraryNamedExports,
				);

				const dtsPath = `${file}.d.ts`;
				await fs.writeFile(dtsPath, dtsContent, 'utf8');
				return {
					file,
					dtsPath,
				};
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

	const failedFiles = results.filter((r): r is Result & { error: string;
		errorType: string; } => 'error' in r);

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
});
