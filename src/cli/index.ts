/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { generateTypes } from '../plugin/generate-types.js';
import { writeFileIfChanged } from '../type-files.js';
import { createCssModuleLoader } from './load-css-module.js';
import { formatDebugPath } from './debug.js';
import {
	findViteConfigInDirectory,
	loadProjectContext,
} from './project-context.js';

const defaultGlob = '**/*.module.{css,scss,sass}';

const isPathOutsideRoot = (
	root: string,
	filePath: string,
) => {
	const relativePath = path.relative(root, filePath);
	return relativePath.startsWith(`..${path.sep}`)
		|| path.isAbsolute(relativePath);
};

(async () => {
	const argv = cli({
		name: 'vite-css-modules',

		parameters: [
			'[globs...]',
		],

		flags: {
			config: {
				type: String,
				description: 'Path to vite config file',
			},
			mode: {
				type: String,
				description: 'Vite mode',
				default: 'development',
			},
		},
	});

	const cwd = process.cwd();
	const { globs: inputGlobs = [] } = argv._;
	const { config, mode } = argv.flags;
	const usingDefaultGlob = inputGlobs.length === 0;
	const configPath = config
		? path.resolve(config)
		: await findViteConfigInDirectory(cwd);

	if (!configPath) {
		console.error(`No vite.config.* found in the current working directory: ${cwd}`);
		console.error('Run this command from the same cwd as Vite, or pass --config.');
		process.exitCode = 1;
		return;
	}

	const projectContext = await loadProjectContext({
		configPath,
		mode,
	});
	const { root } = projectContext.resolvedConfig;

	let globs = inputGlobs;
	let globCwd = cwd;

	if (usingDefaultGlob) {
		if (isPathOutsideRoot(cwd, root)) {
			console.error(`Resolved Vite root is outside the current working directory: ${root}`);
			console.error('Pass explicit globs to control the search scope.');
			process.exitCode = 1;
			return;
		}

		globs = [defaultGlob];
		globCwd = root;
	}

	const files = await glob(globs, {
		absolute: true,
		cwd: globCwd,
		ignore: ['**/node_modules/**'],
	});

	if (files.length === 0) {
		console.error('No files matched the provided glob patterns');
		return;
	}

	const loadCssModule = createCssModuleLoader(projectContext);

	for (const filePath of files) {
		try {
			const sourceCode = await fs.readFile(filePath, 'utf8');
			const {
				exports,
				sourceMapOptions,
			} = await loadCssModule(filePath, true, sourceCode);
			const generatedDts = generateTypes(
				exports,
				'both',
				false,
				sourceMapOptions,
			);

			const dtsPath = `${filePath}.d.ts`;
			await writeFileIfChanged(dtsPath, generatedDts);
			console.log(`\u2713 ${formatDebugPath(dtsPath, cwd)}`);
		} catch (error) {
			console.error(`\u2717 ${formatDebugPath(filePath, cwd)}`);
			console.error(`  ${(error as Error).message}`);
			process.exitCode = 1;
		}
	}
})().catch((error: Error) => {
	console.error(error.message);
	process.exitCode = 1;
});
/* eslint-enable no-console */
