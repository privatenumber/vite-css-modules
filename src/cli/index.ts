/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { generateTypes } from '../plugin/generate-types.js';
import { createCssModuleLoader } from './load-css-module.js';
import {
	createDebug,
	formatDebugPath,
} from './debug.js';
import {
	findViteConfigInDirectory,
	loadProjectContext,
} from './project-context.js';

const debug = createDebug('vite-css-modules:cli');
const defaultGlobs = [
	'**/*.module.{css,scss,sass}',
];

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
	const files = new Set<string>();
	const globStart = performance.now();

	for (const input of inputs) {
		const inputStart = performance.now();
		debug('expanding glob', {
			cwd: formatDebugPath(cwd, cwd),
			pattern: input,
		});
		const matches = await glob(input, {
			absolute: true,
			cwd,
			ignore: ['**/node_modules/**'],
		});
		for (const match of matches) {
			files.add(match);
		}

		debug('expanded glob', {
			cwd: formatDebugPath(cwd, cwd),
			durationMs: Math.round(performance.now() - inputStart),
			matches: matches.length,
			pattern: input,
		});
	}

	debug('matched files', {
		count: files.size,
		cwd: formatDebugPath(cwd, cwd),
		durationMs: Math.round(performance.now() - globStart),
		inputs,
	});

	return [...files];
};

const writeFileIfChanged = async (
	filePath: string,
	content: string,
) => {
	const existingContent = await fs.readFile(filePath, 'utf8').catch(() => null);
	if (existingContent !== content) {
		await fs.writeFile(filePath, content);
	}
};

const deleteFileIfExists = async (
	filePath: string,
) => {
	try {
		await fs.unlink(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
};

const inlineSourceMapPattern = /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)\n?$/;

const writeDtsFiles = async (
	filePath: string,
	dts: string,
) => {
	const dtsPath = `${filePath}.d.ts`;
	const dtsMapPath = `${dtsPath}.map`;
	const inlineSourceMapMatch = dts.match(inlineSourceMapPattern);

	if (!inlineSourceMapMatch) {
		await writeFileIfChanged(dtsPath, dts);
		await deleteFileIfExists(dtsMapPath);
		return [dtsPath];
	}

	const dtsMap = Buffer.from(inlineSourceMapMatch[1]!, 'base64').toString('utf8');
	const dtsWithExternalSourceMap = dts.replace(
		inlineSourceMapPattern,
		`//# sourceMappingURL=${path.basename(dtsMapPath)}\n`,
	);

	await writeFileIfChanged(dtsPath, dtsWithExternalSourceMap);
	await writeFileIfChanged(dtsMapPath, dtsMap);

	return [
		dtsPath,
		dtsMapPath,
	];
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
	const inputGlobs = argv._.globs ?? [];
	const explicitConfigPath = argv.flags.config
		? path.resolve(argv.flags.config)
		: undefined;
	let projectContextPromise: ReturnType<typeof loadProjectContext> | undefined;
	let projectContext: Awaited<ReturnType<typeof loadProjectContext>> | undefined;
	let files: string[] = [];

	if (inputGlobs.length === 0) {
		const configPath = explicitConfigPath
			?? await findViteConfigInDirectory(cwd);

		if (!configPath) {
			console.error(`No vite.config.* found in the current working directory: ${cwd}`);
			console.error('Run this command from the same cwd as Vite, or pass --config.');
			process.exitCode = 1;
			return;
		}

		debug('using project config', {
			configPath: formatDebugPath(configPath, cwd),
			cwd: formatDebugPath(cwd, cwd),
		});

		projectContextPromise = loadProjectContext({
			configPath,
			mode: argv.flags.mode,
		});
		projectContext = await projectContextPromise;

		if (isPathOutsideRoot(cwd, projectContext.resolvedConfig.root)) {
			console.error(`Resolved Vite root is outside the current working directory: ${projectContext.resolvedConfig.root}`);
			console.error('Pass explicit globs to control the search scope.');
			process.exitCode = 1;
			return;
		}

		debug('using default globs', {
			configPath: formatDebugPath(projectContext.configPath, cwd),
			globBase: formatDebugPath(projectContext.resolvedConfig.root, cwd),
			globs: defaultGlobs,
		});

		files = await resolveInputFiles(defaultGlobs, projectContext.resolvedConfig.root);
	} else {
		files = await resolveInputFiles(inputGlobs, cwd);
	}

	if (files.length === 0) {
		console.error('No files matched the provided glob patterns');
		return;
	}

	if (!projectContextPromise) {
		const configPath = explicitConfigPath
			?? await findViteConfigInDirectory(cwd);

		if (!configPath) {
			console.error(`No vite.config.* found in the current working directory: ${cwd}`);
			console.error('Run this command from the same cwd as Vite, or pass --config.');
			process.exitCode = 1;
			return;
		}

		debug('using project config', {
			configPath: formatDebugPath(configPath, cwd),
			cwd: formatDebugPath(cwd, cwd),
		});

		projectContextPromise = loadProjectContext({
			configPath,
			mode: argv.flags.mode,
		});
	}

	let loadCssModule: ReturnType<typeof createCssModuleLoader> | undefined;

	for (const file of files) {
		const filePath = file;
		try {
			const fileStart = performance.now();
			debug('processing', formatDebugPath(filePath, cwd));
			const fileProjectContext = projectContext ?? await projectContextPromise!;
			if (isPathOutsideRoot(fileProjectContext.resolvedConfig.root, filePath)) {
				debug('matched file is outside config root', {
					configPath: formatDebugPath(fileProjectContext.configPath, cwd),
					filePath: formatDebugPath(filePath, cwd),
					root: formatDebugPath(fileProjectContext.resolvedConfig.root, cwd),
				});
			}
			if (!loadCssModule) {
				debug('creating css module loader', {
					configPath: formatDebugPath(fileProjectContext.configPath, cwd),
					root: formatDebugPath(fileProjectContext.resolvedConfig.root, cwd),
				});
				loadCssModule = createCssModuleLoader(fileProjectContext);
			}
			const loadStart = performance.now();
			const { exports, sourceMapOptions } = await loadCssModule(
				filePath,
				{ includeSourceMap: true },
			);
			const generateStart = performance.now();
			const dts = generateTypes(
				exports,
				'both',
				false,
				sourceMapOptions,
			);
			const writeStart = performance.now();

			const outputPaths = await writeDtsFiles(filePath, dts);
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
