/* eslint-disable no-console */
import path from 'node:path';
import { generateTypes } from '../plugin/generate-types.js';
import { writeFileIfChanged } from '../write-file-if-changed.js';
import { slash } from '../plugin/url-utils.js';
import type { createCssModuleLoader } from './load-css-module.js';
import type { ProjectContext } from './project-context.js';

export type CssModuleLoader = ReturnType<typeof createCssModuleLoader>;

export const generateDeclarationForFile = async (
	projectContext: ProjectContext,
	loadCssModule: CssModuleLoader,
	cwd: string,
	filePath: string,
	allowArbitraryNamedExports: boolean,
	silent: boolean,
	failOnError: boolean,
): Promise<void> => {
	const relativePath = slash(path.relative(cwd, filePath));
	try {
		const { exports, sourceMapOptions } = await loadCssModule(filePath);
		const generatedDts = generateTypes(
			exports,
			projectContext.exportMode,
			allowArbitraryNamedExports,
			sourceMapOptions,
		);

		const dtsPath = `${filePath}.d.ts`;
		await writeFileIfChanged(dtsPath, generatedDts);
		if (!silent) {
			console.log(`✓ ${relativePath}.d.ts`);
		}
	} catch (error) {
		console.error(`✗ ${relativePath}`);
		console.error(`  ${(error instanceof Error ? error.message : String(error))}`);
		if (failOnError) {
			process.exitCode = 1;
		}
	}
};
/* eslint-enable no-console */
