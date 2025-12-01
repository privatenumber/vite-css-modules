import path from 'node:path';
import { command } from 'cleye';
import { glob } from 'tinyglobby';
import { shouldKeepOriginalExport, getLocalesConventionFunction } from '../../../plugin/locals-convention.js';
import { targetSupportsArbitraryModuleNamespace } from '../../../plugin/supports-arbitrary-module-namespace.js';
import { processFile } from './process-file.js';
import { reportResults } from './report-results.js';

const exportModes = ['both', 'named', 'default'] as const;
const localsConventions = ['camelCase', 'camelCaseOnly', 'dashes', 'dashesOnly'] as const;

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

	console.log(`Found ${files.length.toLocaleString()} CSS Module(s)\n`);

	const validatedExportMode = (exportMode as typeof exportModes[number]) ?? 'both';
	const validatedLocalsConvention = localsConvention as typeof localsConventions[number];

	const cssModulesOptions = validatedLocalsConvention ? { localsConvention: validatedLocalsConvention } : {};
	const keepOriginalExport = shouldKeepOriginalExport(cssModulesOptions);
	const localsConventionFunction = getLocalesConventionFunction(cssModulesOptions);

	const allowArbitraryNamedExports = target
		? targetSupportsArbitraryModuleNamespace(target)
		: false;

	const results = await Promise.all(
		files.map(file => processFile(file, {
			exportMode: validatedExportMode,
			keepOriginalExport,
			localsConventionFunction,
			allowArbitraryNamedExports,
			cssModulesOptions,
		})),
	);

	reportResults(results, files.length);
});
