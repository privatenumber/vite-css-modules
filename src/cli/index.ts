/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { generateTypes } from '../plugin/generate-types.js';
import { writeTypeFiles } from '../type-files.js';
import { createCssModuleLoader } from './load-css-module.js';
import {
	createDebug,
	formatDebugPath,
} from './debug.js';
import {
	findViteConfigInDirectory,
	loadProjectContext,
	type ProjectContext,
} from './project-context.js';

const debug = createDebug('vite-css-modules:cli');
const defaultGlob = '**/*.module.{css,scss,sass}';

const isPathOutsideRoot = (
	root: string,
	filePath: string,
) => {
	const relativePath = path.relative(root, filePath);
	return relativePath === '..'
		|| relativePath.startsWith(`..${path.sep}`)
		|| path.isAbsolute(relativePath);
};

const resolveInputFiles = async (
	inputs: string[],
	cwd: string,
) => {
	const globStart = performance.now();
	debug('expanding glob', {
		cwd: formatDebugPath(cwd, cwd),
		patterns: inputs,
	});
	const files = await glob(inputs, {
		absolute: true,
		cwd,
		ignore: ['**/node_modules/**'],
	});

	debug('matched files', {
		count: files.length,
		cwd: formatDebugPath(cwd, cwd),
		durationMs: Math.round(performance.now() - globStart),
		inputs,
	});

	return files;
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
	let globs = inputGlobs;
	let globCwd = cwd;

	if (configPath) {
		debug('using project config', {
			configPath: formatDebugPath(configPath, cwd),
			cwd: formatDebugPath(cwd, cwd),
		});
	}

	if (!configPath) {
		console.error(`No vite.config.* found in the current working directory: ${cwd}`);
		console.error('Run this command from the same cwd as Vite, or pass --config.');
		process.exitCode = 1;
		return;
	}

	const projectContext: ProjectContext = await loadProjectContext({
		configPath,
		mode,
	});

	if (usingDefaultGlob) {
		if (isPathOutsideRoot(cwd, projectContext.resolvedConfig.root)) {
			console.error(`Resolved Vite root is outside the current working directory: ${projectContext.resolvedConfig.root}`);
			console.error('Pass explicit globs to control the search scope.');
			process.exitCode = 1;
			return;
		}

		debug('using default globs', {
			configPath: formatDebugPath(configPath, cwd),
			globBase: formatDebugPath(projectContext.resolvedConfig.root, cwd),
			glob: defaultGlob,
		});

		globs = [defaultGlob];
		globCwd = projectContext.resolvedConfig.root;
	}

	const files = await resolveInputFiles(globs, globCwd);
	if (files.length === 0) {
		console.error('No files matched the provided glob patterns');
		return;
	}

	debug('creating css module loader', {
		configPath: formatDebugPath(configPath, cwd),
		root: formatDebugPath(projectContext.resolvedConfig.root, cwd),
	});
	const loadCssModule = createCssModuleLoader(projectContext);

	for (const filePath of files) {
		try {
			const fileStart = performance.now();
			debug('processing', formatDebugPath(filePath, cwd));
			if (isPathOutsideRoot(projectContext.resolvedConfig.root, filePath)) {
				debug('matched file is outside config root', {
					configPath: formatDebugPath(configPath, cwd),
					filePath: formatDebugPath(filePath, cwd),
					root: formatDebugPath(projectContext.resolvedConfig.root, cwd),
				});
			}
			const sourceCode = await fs.readFile(filePath, 'utf8');
			const dtsPath = `${filePath}.d.ts`;
			const loadStart = performance.now();
			const {
				exports,
				sourceMapOptions,
			} = await loadCssModule(filePath, true, sourceCode);
			const generateStart = performance.now();
			const generatedDts = generateTypes(
				exports,
				'both',
				false,
				sourceMapOptions,
			);
			const writeStart = performance.now();

			const outputPaths = await writeTypeFiles(dtsPath, generatedDts, 'external');
			debug('processed file', {
				filePath: formatDebugPath(filePath, cwd),
				loadMs: Math.round(generateStart - loadStart),
				outputs: outputPaths.map(outputPath => formatDebugPath(outputPath, cwd)),
				totalMs: Math.round(performance.now() - fileStart),
				writeMs: Math.round(performance.now() - writeStart),
			});
			for (const outputPath of outputPaths) {
				console.log(`\u2713 ${formatDebugPath(outputPath, cwd)}`);
			}
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
