import fs from 'node:fs/promises';
import path from 'node:path';
import { getTsconfig } from 'get-tsconfig';
import {
	createLogger,
	loadConfigFromFile,
	resolveConfig,
	type CSSModulesOptions,
	type InlineConfig,
	type Plugin,
	type PluginOption,
	type ResolvedConfig,
	type UserConfig,
} from 'vite';
import type { PatchConfig } from '../plugin/index.js';
import type { ExportMode } from '../plugin/types.js';
import { patchCssModulesConfigSymbol } from '../patch.js';
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
	exportMode?: ExportMode;
	resolvedConfig: ResolvedConfig;
};

type ProjectContextOptions = {
	configPath: string;
	mode: string;
};

const flattenPlugins = async (
	plugins: UserConfig['plugins'],
) => {
	const flattenedPlugins: Plugin[] = [];

	const visit = async (
		plugin: PluginOption | PluginOption[] | null | undefined,
	): Promise<void> => {
		if (!plugin) {
			return;
		}

		if (Array.isArray(plugin)) {
			for (const item of plugin) {
				await visit(item);
			}
			return;
		}

		if (typeof plugin === 'object' && 'then' in plugin && typeof plugin.then === 'function') {
			await visit(await plugin);
			return;
		}

		if (typeof plugin !== 'object' || !('name' in plugin) || typeof plugin.name !== 'string') {
			return;
		}

		flattenedPlugins.push(plugin);
	};

	await visit(plugins);
	return flattenedPlugins;
};

const extractPatchCssModulesConfig = async (
	plugins: UserConfig['plugins'],
) => {
	const loadedPlugins = await flattenPlugins(plugins);
	const patchCssModulesPlugin = loadedPlugins.find(
		plugin => plugin.name === 'patch-css-modules',
	) as (Plugin & {
		[patchCssModulesConfigSymbol]?: PatchConfig;
	}) | undefined;

	return patchCssModulesPlugin?.[patchCssModulesConfigSymbol];
};

const fileExists = async (filePath: string) => {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
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
		if (await fileExists(configPath)) {
			debugConfig('found vite config in cwd', {
				configPath: formatDebugPath(configPath),
				durationMs: Math.round(performance.now() - searchStart),
			});
			return configPath;
		}
	}
};

const mergeModulesConfig = (
	modulesConfig: CSSModulesOptions | false | undefined,
) => ({
	...modulesConfig,
});

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

const resolveDeclarationMap = (
	root: string,
	patchCssModulesConfig?: PatchConfig,
) => (
	patchCssModulesConfig?.declarationMap
		?? getTsconfig(root)?.config.compilerOptions?.declarationMap
		?? false
);

const loadConfigProjectContext = async (
	options: ProjectContextOptions & {
		configPath: string;
	},
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

	const patchConfigStart = performance.now();
	const patchCssModulesConfig = await extractPatchCssModulesConfig(loadedConfig.config.plugins);
	const cssModulesConfig = mergeModulesConfig(
		loadedConfig.config.css?.modules,
	);
	const resolveStart = performance.now();
	const resolvedConfig = await resolveConfig(
		sanitizeUserConfig(options.configPath, loadedConfig.config, options),
		'serve',
		options.mode,
		undefined,
		false,
	);
	debugConfig('resolved project context', {
		configPath: formatDebugPath(loadedConfig.path),
		declarationMap: resolveDeclarationMap(resolvedConfig.root, patchCssModulesConfig),
		extractPatchCssModulesConfigMs: Math.round(resolveStart - patchConfigStart),
		exportMode: patchCssModulesConfig?.exportMode,
		resolveConfigMs: Math.round(performance.now() - resolveStart),
		root: formatDebugPath(resolvedConfig.root),
		transformer: resolvedConfig.css.transformer,
	});

	return {
		cssModulesConfig,
		configPath: loadedConfig.path,
		declarationMap: resolveDeclarationMap(resolvedConfig.root, patchCssModulesConfig),
		exportMode: patchCssModulesConfig?.exportMode,
		resolvedConfig,
	};
};

export const loadProjectContext = async (
	options: ProjectContextOptions,
) => loadConfigProjectContext(options);
