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

const viteConfigNames = [
	'vite.config.ts',
	'vite.config.mts',
	'vite.config.cts',
	'vite.config.js',
	'vite.config.mjs',
	'vite.config.cjs',
];

export type ConfigLoader = 'bundle' | 'runner' | 'native';

export type ProjectContext = {
	cssModulesConfig: CSSModulesOptions;
	configPath?: string;
	declarationMap: boolean;
	exportMode?: ExportMode;
	invocationCwd: string;
	resolvedConfig: ResolvedConfig;
};

type ProjectContextOptions = {
	configPath?: string;
	configLoader: ConfigLoader;
	invocationCwd: string;
	localsConvention?: CSSModulesOptions['localsConvention'];
	mode: string;
	noConfig?: boolean;
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

export const findNearestViteConfig = async (
	filePath: string,
) => {
	let currentDirectory = path.dirname(filePath);

	while (true) {
		for (const configName of viteConfigNames) {
			const configPath = path.join(currentDirectory, configName);
			if (await fileExists(configPath)) {
				return configPath;
			}
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			return;
		}

		currentDirectory = parentDirectory;
	}
};

export const withProcessCwd = async <Value>(
	cwd: string,
	load: () => Promise<Value>,
) => {
	const previousCwd = process.cwd();
	process.chdir(cwd);

	try {
		return await load();
	} finally {
		process.chdir(previousCwd);
	}
};

const mergeModulesConfig = (
	modulesConfig: CSSModulesOptions | false | undefined,
	localsConvention?: CSSModulesOptions['localsConvention'],
) => ({
	...modulesConfig,
	...(localsConvention
		? { localsConvention }
		: {}),
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
				: options.invocationCwd
		),
		mode: options.mode,
		plugins: [],
		resolve: userConfig.resolve
			? {
				alias: userConfig.resolve.alias,
			}
			: undefined,
		css: (
			userConfig.css
				|| options.localsConvention
		)
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
): Promise<ProjectContext> => withProcessCwd(
	options.invocationCwd,
	async () => {
		process.env.VITE_CSS_MODULES_CLI = '1';

		const loadedConfig = await loadConfigFromFile(
			{
				command: 'serve',
				mode: options.mode,
			},
			options.configPath,
			path.dirname(options.configPath),
			'silent',
			createLogger('silent'),
			options.configLoader,
		);

		if (!loadedConfig) {
			throw new Error(`Could not load Vite config: ${options.configPath}`);
		}

		const patchCssModulesConfig = await extractPatchCssModulesConfig(loadedConfig.config.plugins);
		const cssModulesConfig = mergeModulesConfig(
			loadedConfig.config.css?.modules,
			options.localsConvention,
		);
		const resolvedConfig = await resolveConfig(
			sanitizeUserConfig(options.configPath, loadedConfig.config, options),
			'serve',
			options.mode,
			undefined,
			false,
		);

		return {
			cssModulesConfig,
			configPath: loadedConfig.path,
			declarationMap: resolveDeclarationMap(resolvedConfig.root, patchCssModulesConfig),
			exportMode: patchCssModulesConfig?.exportMode,
			invocationCwd: options.invocationCwd,
			resolvedConfig,
		};
	},
);

const loadNoConfigProjectContext = async (
	options: ProjectContextOptions,
): Promise<ProjectContext> => withProcessCwd(
	options.invocationCwd,
	async () => {
		const resolvedConfig = await resolveConfig(
			{
				configFile: false,
				root: options.invocationCwd,
				mode: options.mode,
				plugins: [],
				css: {
					modules: false,
				},
			},
			'serve',
			options.mode,
			undefined,
			false,
		);

		return {
			cssModulesConfig: mergeModulesConfig(undefined, options.localsConvention),
			declarationMap: resolveDeclarationMap(resolvedConfig.root),
			invocationCwd: options.invocationCwd,
			resolvedConfig,
		};
	},
);

export const loadProjectContext = async (
	options: ProjectContextOptions,
) => {
	if (
		options.noConfig
		|| !options.configPath
	) {
		return loadNoConfigProjectContext(options);
	}

	return loadConfigProjectContext(options as ProjectContextOptions & {
		configPath: string;
	});
};
