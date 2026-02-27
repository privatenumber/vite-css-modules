/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { transform } from '../plugin/transformers/postcss/index.js';
import { generateTypes } from '../plugin/generate-types.js';
import { shouldKeepOriginalExport, getLocalesConventionFunction } from '../plugin/locals-convention.js';
import type { ExportMode } from '../plugin/types.js';
import { cssModuleExportsToExports } from './css-module-exports-to-exports.js';

const exportModes = ['both', 'named', 'default'] as const;
const ExportModeType = (value: string) => {
	if (!exportModes.includes(value as ExportMode)) {
		throw new Error(`Invalid export mode: ${value}. Must be one of: ${exportModes.join(', ')}`);
	}
	return value as ExportMode;
};

const localsConventions = ['camelCase', 'camelCaseOnly', 'dashes', 'dashesOnly'] as const;
type LocalsConvention = typeof localsConventions[number];
const LocalsConventionType = (value: string) => {
	if (!localsConventions.includes(value as LocalsConvention)) {
		throw new Error(`Invalid locals convention: ${value}. Must be one of: ${localsConventions.join(', ')}`);
	}
	return value as LocalsConvention;
};

(async () => {
	const argv = cli({
		name: 'vite-css-modules',

		parameters: [
			'<globs...>',
		],

		flags: {
			exportMode: {
				type: ExportModeType,
				alias: 'e',
				description: `Export mode: ${exportModes.join(', ')}`,
				default: ExportModeType('both'),
			},
			localsConvention: {
				type: LocalsConventionType,
				alias: 'l',
				description: `Locals convention: ${localsConventions.join(', ')}`,
			},
			arbitraryExports: {
				type: Boolean,
				description: 'Allow arbitrary module namespace exports (ES2022+)',
				default: false,
			},
		},
	});

	const { exportMode, localsConvention } = argv.flags;

	const cssModulesConfig = localsConvention
		? { localsConvention }
		: {};

	const keepOriginalExport = shouldKeepOriginalExport(cssModulesConfig);
	const localsConventionFunction = getLocalesConventionFunction(cssModulesConfig);

	const files = await glob(argv._.globs);

	if (files.length === 0) {
		console.error('No files matched the provided glob patterns');
		return;
	}

	const allowArbitraryNamedExports = argv.flags.arbitraryExports;

	await Promise.all(
		files.map(async (file) => {
			const filePath = path.resolve(file);
			try {
				const code = await fs.readFile(filePath, 'utf8');
				const result = transform(code, filePath, {}, false);
				const exports = cssModuleExportsToExports(
					result.exports,
					filePath,
					keepOriginalExport,
					localsConventionFunction,
				);
				const dts = generateTypes(exports, exportMode, allowArbitraryNamedExports);
				await fs.writeFile(`${filePath}.d.ts`, dts);
				console.log(`\u2713 ${file}`);
			} catch (error) {
				console.error(`\u2717 ${file}`);
				console.error(`  ${(error as Error).message}`);
				process.exitCode = 1;
			}
		}),
	);
})().catch((error: Error) => {
	console.error(error.message);
	process.exitCode = 1;
});
/* eslint-enable no-console */
