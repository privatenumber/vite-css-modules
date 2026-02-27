/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { transform } from '../plugin/transformers/postcss/index.js';
import { generateTypes } from '../plugin/generate-types.js';
import { shouldKeepOriginalExport, getLocalesConventionFunction } from '../plugin/locals-convention.js';
import type { Exports } from '../plugin/generate-esm.js';
import type { ExportMode } from '../plugin/types.js';
import type { CSSModuleExports } from '../plugin/transformers/postcss/types.js';

const exportModes = ['both', 'named', 'default'] as const;
const localsConventions = ['camelCase', 'camelCaseOnly', 'dashes', 'dashesOnly'] as const;

const cssModuleExportsToExports = (
	cssModuleExports: CSSModuleExports,
	filePath: string,
	keepOriginalExport: boolean,
	localsConventionFunction?: (
		originalClassName: string,
		generatedClassName: string,
		inputFile: string,
	) => string,
): Exports => {
	const exports: Exports = {};

	for (const [exportName, exported] of Object.entries(cssModuleExports)) {
		const exportAs = new Set<string>();
		if (keepOriginalExport) {
			exportAs.add(exportName);
		}

		let resolved: string;
		if (typeof exported === 'string') {
			const transformedExport = localsConventionFunction?.(exportName, exportName, filePath);
			if (transformedExport) {
				exportAs.add(transformedExport);
			}
			resolved = exported;
		} else {
			const transformedExport = localsConventionFunction?.(exportName, exported.name, filePath);
			if (transformedExport) {
				exportAs.add(transformedExport);
			}

			const composedNames = exported.composes.map(dep => dep.name);
			resolved = [exported.name, ...composedNames].join(' ');
		}

		exports[exportName] = {
			code: resolved,
			resolved,
			exportAs,
		};
	}

	return exports;
};

(async () => {
	const argv = cli({
		name: 'vite-css-modules',

		parameters: [
			'<globs...>',
		],

		flags: {
			exportMode: {
				type: String,
				alias: 'e',
				description: `Export mode: ${exportModes.join(', ')}`,
				default: 'both',
			},
			localsConvention: {
				type: String,
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

	const exportMode = argv.flags.exportMode as ExportMode;
	if (!exportModes.includes(exportMode)) {
		console.error(`Invalid export mode: ${exportMode}. Must be one of: ${exportModes.join(', ')}`);
		process.exitCode = 1;
		return;
	}

	const { localsConvention } = argv.flags;
	if (
		localsConvention
		&& !localsConventions.includes(localsConvention as typeof localsConventions[number])
	) {
		console.error(
			`Invalid locals convention: ${localsConvention}. Must be one of: ${localsConventions.join(', ')}`,
		);
		process.exitCode = 1;
		return;
	}

	const cssModulesConfig = localsConvention
		? { localsConvention: localsConvention as typeof localsConventions[number] }
		: {};

	const keepOriginalExport = shouldKeepOriginalExport(cssModulesConfig);
	const localsConventionFunction = getLocalesConventionFunction(cssModulesConfig);

	const files = await glob(argv._.globs, {
		cwd: process.cwd(),
	});

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
})();
/* eslint-enable no-console */
