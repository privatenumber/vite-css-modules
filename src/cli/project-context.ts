import fs from 'node:fs/promises';
import path from 'node:path';
import { getTsconfig } from 'get-tsconfig';
import {
	createLogger,
	loadConfigFromFile,
	resolveConfig,
	type CSSModulesOptions,
	type InlineConfig,
	type ResolvedConfig,
	type UserConfig,
} from 'vite';
import {
	createDebug,
	formatDebugPath,
} from './debug.js';

const debugConfig = createDebug('vite-css-modules:config');

const viteConfigNames = [
	'vite.config.ts',
	'vite.config.mts',
	'vite.config.cts',
	'vite.config.js',
	'vite.config.mjs',
	'vite.config.cjs',
];

export type ProjectContext = {
	cssModulesConfig: CSSModulesOptions;
	configPath: string;
	declarationMap: boolean;
	resolvedConfig: ResolvedConfig;
};

type ProjectContextOptions = {
	configPath: string;
	mode: string;
};

export const findViteConfigInDirectory = async (
	directoryPath: string,
) => {
	const searchStart = performance.now();
	debugConfig('searching for vite config in cwd', {
		directoryPath: formatDebugPath(directoryPath),
	});

	for (const configName of viteConfigNames) {
		const configPath = path.join(directoryPath, configName);
		const configExists = await fs.access(configPath).then(() => true, () => false);
		if (configExists) {
			debugConfig('found vite config in cwd', {
				configPath: formatDebugPath(configPath),
				durationMs: Math.round(performance.now() - searchStart),
			});
			return configPath;
		}
	}
};

const sanitizeUserConfig = (
	configPath: string,
	userConfig: UserConfig,
	options: ProjectContextOptions,
): InlineConfig => {
	const configDirectory = path.dirname(configPath);

	return {
		configFile: false,
		root: (
			typeof userConfig.root === 'string'
				? path.resolve(configDirectory, userConfig.root)
				: process.cwd()
		),
		mode: options.mode,
		plugins: [],
		resolve: userConfig.resolve
			? {
				alias: userConfig.resolve.alias,
			}
			: undefined,
		css: userConfig.css
			? {
				transformer: userConfig.css?.transformer,
				modules: false,
				preprocessorOptions: userConfig.css?.preprocessorOptions,
				postcss: userConfig.css?.postcss,
				lightningcss: userConfig.css?.lightningcss
					? {
						...userConfig.css.lightningcss,
						cssModules: false,
					}
					: undefined,
			}
			: undefined,
	};
};

export const loadProjectContext = async (
	options: ProjectContextOptions,
): Promise<ProjectContext> => {
	process.env.VITE_CSS_MODULES_CLI = '1';
	const loadStart = performance.now();
	debugConfig('loading vite config', {
		configPath: formatDebugPath(options.configPath),
	});

	const loadedConfig = await loadConfigFromFile(
		{
			command: 'serve',
			mode: options.mode,
		},
		options.configPath,
		path.dirname(options.configPath),
		'silent',
		createLogger('silent'),
		'bundle',
	);

	if (!loadedConfig) {
		throw new Error(`Could not load Vite config: ${options.configPath}`);
	}
	debugConfig('loaded vite config', {
		configPath: formatDebugPath(loadedConfig.path),
		durationMs: Math.round(performance.now() - loadStart),
	});

	const resolveStart = performance.now();
	const resolvedConfig = await resolveConfig(
		sanitizeUserConfig(options.configPath, loadedConfig.config, options),
		'serve',
		options.mode,
		undefined,
		false,
	);
	const declarationMap = Boolean(
		getTsconfig(resolvedConfig.root)?.config.compilerOptions?.declarationMap,
	);
	debugConfig('resolved project context', {
		configPath: formatDebugPath(loadedConfig.path),
		declarationMap,
		resolveConfigMs: Math.round(performance.now() - resolveStart),
		root: formatDebugPath(resolvedConfig.root),
		transformer: resolvedConfig.css.transformer,
	});

	return {
		cssModulesConfig: {
			...loadedConfig.config.css?.modules,
		},
		configPath: loadedConfig.path,
		declarationMap,
		resolvedConfig,
	};
};
