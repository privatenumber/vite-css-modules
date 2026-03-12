/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { generateTypes } from '../plugin/generate-types.js';
import { createCssModuleLoader } from './load-css-module.js';
import {
	findNearestViteConfig,
	loadProjectContext,
} from './project-context.js';

const resolveInputFiles = async (
	inputs: string[],
	cwd: string,
) => {
	const files = new Set<string>();

	for (const input of inputs) {
		const matches = await glob(input, {
			absolute: true,
			cwd,
		});
		for (const match of matches) {
			files.add(match);
		}
	}

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

(async () => {
	const argv = cli({
		name: 'vite-css-modules',

		parameters: [
			'<globs...>',
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
	const files = await resolveInputFiles(argv._.globs, cwd);

	if (files.length === 0) {
		console.error('No files matched the provided glob patterns');
		return;
	}

	const explicitConfigPath = argv.flags.config
		? path.resolve(argv.flags.config)
		: undefined;
	const contextCache = new Map<string, {
		loadCssModule?: ReturnType<typeof createCssModuleLoader>;
		projectContextPromise: ReturnType<typeof loadProjectContext>;
	}>();

	const getProjectContext = async (
		filePath: string,
	) => {
		const configPath = (
			explicitConfigPath
				?? await findNearestViteConfig(filePath)
		);
		const cacheKey = JSON.stringify({
			configPath,
			cwd,
			mode: argv.flags.mode,
		});

		let projectContext = contextCache.get(cacheKey);
		if (!projectContext) {
			projectContext = {
				projectContextPromise: loadProjectContext({
					configPath,
					invocationCwd: cwd,
					mode: argv.flags.mode,
				}),
			};
			contextCache.set(cacheKey, projectContext);
		}

		return projectContext;
	};

	for (const file of files) {
		const filePath = file;
		try {
			const projectContextEntry = await getProjectContext(filePath);
			const projectContext = await projectContextEntry.projectContextPromise;
			if (!projectContextEntry.loadCssModule) {
				projectContextEntry.loadCssModule = createCssModuleLoader(projectContext);
			}
			const { exports, sourceMapOptions } = await projectContextEntry.loadCssModule(
				filePath,
				{ includeSourceMap: true },
			);
			const dts = generateTypes(
				exports,
				projectContext.exportMode ?? 'both',
				false,
				sourceMapOptions,
			);

			await writeFileIfChanged(`${filePath}.d.ts`, dts);
			console.log(`\u2713 ${file}`);
		} catch (error) {
			console.error(`\u2717 ${file}`);
			console.error(`  ${(error as Error).message}`);
			process.exitCode = 1;
		}
	}
})().catch((error: Error) => {
	console.error(error.message);
	process.exitCode = 1;
});
/* eslint-enable no-console */
