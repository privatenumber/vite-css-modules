/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { generateTypes } from '../plugin/generate-types.js';
import type { ExportMode } from '../plugin/types.js';
import { createCssModuleLoader } from './load-css-module.js';
import {
	findNearestViteConfig,
	loadProjectContext,
	type ConfigLoader,
} from './project-context.js';

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

const configLoaders = ['bundle', 'runner', 'native'] as const;
const ConfigLoaderType = (value: string) => {
	if (!configLoaders.includes(value as ConfigLoader)) {
		throw new Error(`Invalid config loader: ${value}. Must be one of: ${configLoaders.join(', ')}`);
	}
	return value as ConfigLoader;
};

const fileExists = async (
	filePath: string,
) => {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
};

const resolveInputFiles = async (
	inputs: string[],
	invocationCwd: string,
) => {
	const shellCwd = process.cwd();
	const files = new Set<string>();

	for (const input of inputs) {
		const matches = await glob(input, {
			absolute: true,
			cwd: invocationCwd,
		});

		if (matches.length > 0 || invocationCwd === shellCwd || path.isAbsolute(input)) {
			for (const match of matches) {
				files.add(match);
			}
			continue;
		}

		for (const match of await glob(input, {
			absolute: true,
			cwd: shellCwd,
		})) {
			files.add(match);
		}
	}

	return [...files];
};

const resolveInputPath = async (
	inputPath: string,
	invocationCwd: string,
) => {
	const resolvedFromInvocationCwd = path.resolve(invocationCwd, inputPath);
	if (await fileExists(resolvedFromInvocationCwd)) {
		return resolvedFromInvocationCwd;
	}

	return path.resolve(inputPath);
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
				exportMode: {
					type: ExportModeType,
					alias: 'e',
					description: `Export mode: ${exportModes.join(', ')}`,
				},
			localsConvention: {
				type: LocalsConventionType,
				alias: 'l',
				description: `Locals convention: ${localsConventions.join(', ')}`,
			},
			config: {
				type: String,
				description: 'Path to vite config file',
			},
			cwd: {
				type: String,
				description: 'Working directory for Vite config evaluation',
			},
			mode: {
				type: String,
				description: 'Vite mode',
				default: 'development',
			},
			configLoader: {
				type: ConfigLoaderType,
				description: `Config loader: ${configLoaders.join(', ')}`,
				default: ConfigLoaderType('bundle'),
			},
			noConfig: {
				type: Boolean,
				description: 'Disable Vite config loading',
				default: false,
			},
			arbitraryExports: {
				type: Boolean,
				description: 'Allow arbitrary module namespace exports (ES2022+)',
				default: false,
			},
		},
	});

	const invocationCwd = path.resolve(argv.flags.cwd ?? process.cwd());
	const files = await resolveInputFiles(argv._.globs, invocationCwd);

	if (files.length === 0) {
		console.error('No files matched the provided glob patterns');
		return;
	}

	const explicitConfigPath = argv.flags.config
		? await resolveInputPath(argv.flags.config, invocationCwd)
		: undefined;
	const contextCache = new Map<string, {
		loadCssModule?: ReturnType<typeof createCssModuleLoader>;
		projectContextPromise: ReturnType<typeof loadProjectContext>;
	}>();

	const getProjectContext = async (
		filePath: string,
	) => {
		const configPath = (
			argv.flags.noConfig
				? undefined
				: (
					explicitConfigPath
						?? await findNearestViteConfig(filePath)
				)
		);
		const cacheKey = JSON.stringify({
			configPath,
			configLoader: argv.flags.configLoader,
			invocationCwd,
			localsConvention: argv.flags.localsConvention,
			mode: argv.flags.mode,
			noConfig: argv.flags.noConfig,
		});

		let projectContext = contextCache.get(cacheKey);
		if (!projectContext) {
			projectContext = {
				projectContextPromise: loadProjectContext({
				configPath,
					configLoader: argv.flags.configLoader,
					invocationCwd,
					localsConvention: argv.flags.localsConvention,
					mode: argv.flags.mode,
					noConfig: argv.flags.noConfig,
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
				argv.flags.exportMode
					?? projectContext.exportMode
					?? 'both',
				argv.flags.arbitraryExports,
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
