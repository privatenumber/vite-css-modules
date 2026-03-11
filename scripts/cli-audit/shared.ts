import fs from 'node:fs/promises';
import path from 'node:path';
import {
	createLogger,
	loadConfigFromFile,
	resolveConfig,
	searchForWorkspaceRoot,
	type InlineConfig,
	type Plugin,
	type PluginOption,
	type ResolvedConfig,
	type UserConfig,
} from 'vite';

const viteConfigNames = [
	'vite.config.ts',
	'vite.config.mts',
	'vite.config.cts',
	'vite.config.js',
	'vite.config.mjs',
	'vite.config.cjs',
];

const knownPluginKeys = new Set([
	'name',
	'apply',
	'enforce',
	'config',
	'configEnvironment',
	'configResolved',
	'options',
	'buildStart',
	'resolveId',
	'load',
	'transform',
	'buildEnd',
	'closeBundle',
	'hotUpdate',
	'transformIndexHtml',
	'configureServer',
	'configurePreviewServer',
	'handleHotUpdate',
	'viteMetadata',
]);

export type ConfigLoaderName = 'bundle' | 'runner' | 'native';

export const getAuditCwd = (
	configPath: string,
	explicitCwd?: string,
) => (
	explicitCwd
		? path.resolve(explicitCwd)
		: searchForWorkspaceRoot(path.dirname(path.resolve(configPath)))
);

export const fileExists = async (filePath: string) => {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
};

export const findNearestViteConfig = async (entryPath: string) => {
	const absoluteEntryPath = path.resolve(entryPath);
	const stat = await fs.stat(absoluteEntryPath);
	let currentDir = stat.isDirectory()
		? absoluteEntryPath
		: path.dirname(absoluteEntryPath);

	const workspaceRoot = searchForWorkspaceRoot(currentDir);
	while (true) {
		for (const configName of viteConfigNames) {
			const configPath = path.join(currentDir, configName);
			if (await fileExists(configPath)) {
				return configPath;
			}
		}

		if (currentDir === workspaceRoot) {
			return null;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			return null;
		}

		currentDir = parentDir;
	}
};

const flattenPlugins = async (plugins: UserConfig['plugins']) => {
	const flatPlugins: Plugin[] = [];

	const visit = async (value: PluginOption | PluginOption[] | null | undefined): Promise<void> => {
		if (!value) {
			return;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				await visit(item);
			}
			return;
		}

		if (typeof value === 'object' && 'then' in value && typeof value.then === 'function') {
			await visit(await value);
			return;
		}

		if (typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string') {
			return;
		}

		flatPlugins.push(value);
	};

	await visit(plugins);
	return flatPlugins;
};

export const inspectPlugins = async (plugins: UserConfig['plugins']) => {
	const flatPlugins = await flattenPlugins(plugins);
	const patchCssModulesPlugins = flatPlugins.filter(
		plugin => plugin.name === 'patch-css-modules',
	);

	return {
		plugins: flatPlugins,
		pluginNames: flatPlugins.map(plugin => plugin.name),
		patchCssModulesPlugins,
		patchCssModulesMetadataKeys: patchCssModulesPlugins.map(
			plugin => Object.keys(plugin).filter(key => !knownPluginKeys.has(key)),
		),
	};
};

export const loadUserConfig = async (
	configPath: string,
	mode = 'development',
	configLoader: ConfigLoaderName = 'bundle',
	cwd = getAuditCwd(configPath),
) => {
	process.env.VITE_CSS_MODULES_CLI = '1';

	const previousCwd = process.cwd();
	process.chdir(cwd);

	try {
		const logger = createLogger('silent');
		const loaded = await loadConfigFromFile(
			{
				command: 'serve',
				mode,
			},
			configPath,
			path.dirname(configPath),
			'silent',
			logger,
			configLoader,
		);

		if (!loaded) {
			throw new Error(`Could not load config: ${configPath}`);
		}

		return loaded;
	} finally {
		process.chdir(previousCwd);
	}
};

export const sanitizeUserConfig = (
	configPath: string,
	userConfig: UserConfig,
	mode = 'development',
): InlineConfig => {
	const configDir = path.dirname(configPath);
	const root = (
		typeof userConfig.root === 'string'
			? path.resolve(configDir, userConfig.root)
			: configDir
	);

	return {
		configFile: false,
		root,
		mode,
		plugins: [],
		resolve: userConfig.resolve
			? {
				alias: userConfig.resolve.alias,
			}
			: undefined,
		css: userConfig.css
			? {
				transformer: userConfig.css.transformer,
				modules: userConfig.css.modules,
				preprocessorOptions: userConfig.css.preprocessorOptions,
				postcss: userConfig.css.postcss,
				lightningcss: userConfig.css.lightningcss,
			}
			: undefined,
	};
};

export const loadResolvedConfig = async (
	configPath: string,
	mode = 'development',
	configLoader: ConfigLoaderName = 'bundle',
	cwd = getAuditCwd(configPath),
) => {
	const previousCwd = process.cwd();
	process.chdir(cwd);

	try {
		const loaded = await loadUserConfig(configPath, mode, configLoader, cwd);
		const pluginInfo = await inspectPlugins(loaded.config.plugins);
		const inlineConfig = sanitizeUserConfig(configPath, loaded.config, mode);

		const resolvedConfig = await resolveConfig(
			inlineConfig,
			'serve',
			mode,
			undefined,
			false,
		);

		return {
			configPath: loaded.path,
			userConfig: loaded.config,
			resolvedConfig,
			pluginInfo,
			dependencies: loaded.dependencies,
			cwd,
		};
	} finally {
		process.chdir(previousCwd);
	}
};

export const summarizeResolvedConfig = (resolvedConfig: ResolvedConfig) => ({
	root: resolvedConfig.root,
	transformer: resolvedConfig.css.transformer,
	cssModulesConfigPresent: Boolean(resolvedConfig.css.modules),
	cssModulesKeys: resolvedConfig.css.modules
		? Object.keys(resolvedConfig.css.modules)
		: [],
	resolveAliasType: Array.isArray(resolvedConfig.resolve.alias)
		? 'array'
		: (
			resolvedConfig.resolve.alias
				? 'object'
				: 'none'
		),
	resolveAliasCount: Array.isArray(resolvedConfig.resolve.alias)
		? resolvedConfig.resolve.alias.length
		: (
			resolvedConfig.resolve.alias
				? Object.keys(resolvedConfig.resolve.alias).length
				: 0
		),
});

export const formatJson = (value: unknown) => JSON.stringify(value, null, 2);
