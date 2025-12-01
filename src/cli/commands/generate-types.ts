import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'tinyglobby';
import type { Exports } from '../../plugin/generate-esm.js';
import type { ExportMode } from '../../plugin/types.js';
import { generateTypes } from '../../plugin/generate-types.js';
import { transform } from '../../plugin/transformers/postcss/index.js';
import { shouldKeepOriginalExport, getLocalesConventionFunction } from '../../plugin/locals-convention.js';
import { targetSupportsArbitraryModuleNamespace } from '../../plugin/supports-arbitrary-module-namespace.js';

type LocalsConvention = 'camelCase' | 'camelCaseOnly' | 'dashes' | 'dashesOnly';

type Options = {
	exportMode: ExportMode;
	localsConvention?: LocalsConvention;
	target?: string;
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

	console.log(`Found ${files.length} CSS Module(s)`);

	const { exportMode, localsConvention, target } = options;

	const cssModulesOptions = localsConvention ? { localsConvention } : {};
	const keepOriginalExport = shouldKeepOriginalExport(cssModulesOptions);
	const localsConventionFunction = getLocalesConventionFunction(cssModulesOptions);

	const allowArbitraryNamedExports = target
		? targetSupportsArbitraryModuleNamespace(target)
		: false;

	await Promise.all(
		files.map(async (file) => {
			try {
				const code = await fs.readFile(file, 'utf8');
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
				console.log(`✓ ${dtsPath}`);
			} catch (error) {
				console.error(`✗ ${file}`);
				console.error(`  ${error instanceof Error ? error.message : String(error)}`);
				process.exitCode = 1;
			}
		}),
	);

	if (process.exitCode === 1) {
		console.error('\nFailed to generate types');
	} else {
		console.log(`\n✓ Successfully generated types for ${files.length} CSS Module(s)`);
	}
};
