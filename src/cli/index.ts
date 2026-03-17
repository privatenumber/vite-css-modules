/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { generateTypes } from '../plugin/generate-types.js';
import { writeFileIfChanged } from '../type-files.js';
import { slash } from '../plugin/url-utils.js';
import { createCssModuleLoader } from './load-css-module.js';
import {
	findViteConfigInDirectory,
	loadProjectContext,
} from './project-context.js';

const defaultGlob = '**/*.module.{css,scss,sass}';

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
	const configPath = config
		? path.resolve(config)
		: await findViteConfigInDirectory(cwd);

	if (!configPath) {
		throw new Error(`No vite.config.* found in the current working directory: ${cwd}\nRun this command from the same cwd as Vite, or pass --config.`);
	}

	const projectContext = await loadProjectContext({
		configPath,
		mode,
	});
	const { root } = projectContext.resolvedConfig;

	let globs: string[];
	let globCwd: string;

	if (inputGlobs.length === 0) {
		const rootRelative = path.relative(cwd, root);
		if (rootRelative.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelative)) {
			throw new Error(`Resolved Vite root is outside the current working directory: ${root}\nPass explicit globs to control the search scope.`);
		}

		globs = [defaultGlob];
		globCwd = root;
	} else {
		globs = inputGlobs;
		globCwd = cwd;
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

	const toRelative = (filePath: string) => slash(
		path.isAbsolute(filePath)
			? path.relative(cwd, filePath) || '.'
			: filePath,
	);

	for (const filePath of files) {
		try {
			const sourceCode = await fs.readFile(filePath, 'utf8');
			const {
				exports,
				sourceMapOptions,
			} = await loadCssModule(filePath, true, sourceCode);
			const generatedDts = generateTypes(
				exports,
				projectContext.exportMode,
				false,
				sourceMapOptions,
			);

			const dtsPath = `${filePath}.d.ts`;
			await writeFileIfChanged(dtsPath, generatedDts);
			console.log(`\u2713 ${toRelative(dtsPath)}`);
		} catch (error) {
			console.error(`\u2717 ${toRelative(filePath)}`);
			console.error(`  ${(error as Error).message}`);
			process.exitCode = 1;
		}
	}
})().catch((error: Error) => {
	console.error(error.message);
	process.exitCode = 1;
});
/* eslint-enable no-console */
