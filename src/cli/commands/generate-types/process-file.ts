import fs from 'node:fs/promises';
import type { CSSModulesOptions } from 'vite';
import type { Exports } from '../../../plugin/generate-esm.js';
import type { ExportMode } from '../../../plugin/types.js';
import { generateTypes } from '../../../plugin/generate-types.js';
import { transform } from '../../../plugin/transformers/postcss/index.js';
import { compileSass } from './sass.js';

const preprocessorExtensions = new Set(['.scss', '.sass', '.less', '.styl', '.stylus']);
const sassExtensions = new Set(['.scss', '.sass']);

export type SuccessResult = {
	file: string;
	dtsPath: string;
};

export type ErrorResult = {
	file: string;
	error: string;
	errorType: 'sass-not-found' | 'preprocessor' | 'other';
};

export type ProcessResult = SuccessResult | ErrorResult;

export type ProcessFileOptions = {
	exportMode: ExportMode;
	keepOriginalExport: boolean;
	localsConventionFunction?: (exportName: string, className: string, file: string) => string;
	allowArbitraryNamedExports: boolean;
	cssModulesOptions: CSSModulesOptions;
};

export const processFile = async (
	file: string,
	options: ProcessFileOptions,
): Promise<ProcessResult> => {
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

		const { exports: cssExports } = transform(code, file, options.cssModulesOptions);

		const exportNames: Exports = Object.fromEntries(
			Object.entries(cssExports).map(([exportName, exported]) => {
				const exportAs = new Set<string>();

				if (options.keepOriginalExport) {
					exportAs.add(exportName);
				}

				const className = typeof exported === 'string' ? exportName : exported.name;
				const transformedExport = options.localsConventionFunction?.(exportName, className, file);
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
			options.exportMode,
			options.allowArbitraryNamedExports,
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
};
