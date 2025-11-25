import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'tinyglobby';
import type { ResolvedConfig, CSSModulesOptions } from 'vite';
import type { Exports } from '../../plugin/generate-esm.js';
import type { ExportMode } from '../../plugin/types.js';
import { getViteConfig } from '../get-vite-config.js';
import { generateTypes } from '../../plugin/generate-types.js';
import { transform } from '../../plugin/transformers/postcss/index.js';
import { supportsArbitraryModuleNamespace } from '../../plugin/supports-arbitrary-module-namespace.js';

type ConfigCache = {
	configRoot: string;
	viteConfig: ResolvedConfig;
	pluginOptions: {
		isCssModulesDisabled: boolean;
		generateSourceTypes?: boolean;
		exportMode: ExportMode;
		cssModulesOptions?: CSSModulesOptions | false;
	};
	allowArbitraryNamedExports: boolean;
	cssModulesOptions: CSSModulesOptions;
};

const viteConfigNames = [
	'vite.config.ts',
	'vite.config.mts',
	'vite.config.js',
	'vite.config.mjs',
	'vite.config.cjs',
	'vite.config.cts',
];

const findClosestViteConfig = async (
	filePath: string,
	knownConfigRoots: Map<string, ConfigCache>,
): Promise<{ configRoot: string;
	configFile: string; } | undefined> => {
	const absolutePath = path.resolve(filePath);
	let currentDirectory = path.dirname(absolutePath);
	const { root } = path.parse(currentDirectory);

	// Check if we already know about a config in any parent directory
	// This allows files in the same project to skip filesystem lookups entirely.
	// Example: if pkg-a/lib/a.module.css already found config at pkg-a/,
	// then pkg-a/lib/b.module.css will hit cache at pkg-a/ without disk access.
	while (currentDirectory !== root) {
		const cached = knownConfigRoots.get(currentDirectory);
		if (cached) {
			return {
				configRoot: currentDirectory,
				configFile: cached.viteConfig.configFile!,
			};
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			break;
		}
		currentDirectory = parentDirectory;
	}

	// No cached config found, search filesystem
	currentDirectory = path.dirname(absolutePath);
	while (currentDirectory !== root) {
		for (const configName of viteConfigNames) {
			const configPath = path.join(currentDirectory, configName);
			try {
				await fs.access(configPath);
				return {
					configRoot: currentDirectory,
					configFile: configPath,
				};
			} catch {
				// Config doesn't exist, continue
			}
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			break;
		}
		currentDirectory = parentDirectory;
	}

	return undefined;
};

export const generateTypesCommand = async (
	directories: string[],
) => {
	const files = await glob(
		directories.map(
			directory => path.posix.join(directory, '**/*.module.{css,scss,sass,less,styl,stylus,pcss,postcss}'),
		),
		{
			ignore: [
				'**/node_modules/**',
				'**/dist/**',
				'**/build/**',
				'**/.git/**',
				'**/coverage/**',
			],
		},
	);
	if (files.length === 0) {
		console.log('No CSS Modules found');
		return;
	}

	console.log(`Found ${files.length} CSS Module(s)`);

	const configCache = new Map<string, ConfigCache>();
	let configLoadMutex = Promise.resolve();

	const getConfigForFile = async (file: string): Promise<ConfigCache | undefined> => {
		const result = await findClosestViteConfig(file, configCache);
		if (!result) {
			return undefined;
		}

		const { configRoot, configFile } = result;

		let cached = configCache.get(configRoot);
		if (cached) {
			return cached;
		}

		// Use mutex to ensure only one config loads at a time
		// This prevents race conditions when multiple configs write to process.env
		await configLoadMutex;
		const currentLoad = (async () => {
			const { viteConfig, pluginOptions } = await getViteConfig(configRoot, configFile);

			if (pluginOptions.isCssModulesDisabled) {
				throw new Error(`CSS Modules is disabled in the Vite config at ${configRoot}`);
			}

			if (!pluginOptions.generateSourceTypes) {
				throw new Error(`generateSourceTypes must be enabled in vite-css-modules config at ${configRoot}`);
			}

			cached = {
				configRoot,
				viteConfig,
				pluginOptions,
				allowArbitraryNamedExports: supportsArbitraryModuleNamespace(viteConfig),
				cssModulesOptions: pluginOptions.cssModulesOptions || {},
			};

			configCache.set(configRoot, cached);
			return cached;
		})();
		configLoadMutex = currentLoad.then(() => {}, () => {});

		return currentLoad;
	};

	await Promise.all(
		files.map(async (file) => {
			let config: ConfigCache | undefined;
			try {
				config = await getConfigForFile(file);
				if (!config) {
					throw new Error('No Vite config found');
				}
			} catch (error) {
				console.error(`✗ ${file}`);
				console.error('  Error: Failed to load Vite config');
				console.error(`  ${error instanceof Error ? error.message : String(error)}`);
				process.exitCode = 1;
				return;
			}

			try {
				const code = await fs.readFile(file, 'utf8');
				const { exports } = await transform(
					code,
					file,
					config.cssModulesOptions,
				);

				const exportNames: Exports = Object.fromEntries(
					Object.keys(exports).map(exportedAs => [exportedAs, {
						exportAs: new Set([exportedAs]),

						// Unused
						code: '',
						resolved: '',
					}]),
				);

				const dtsContent = generateTypes(
					exportNames,
					config.pluginOptions.exportMode,
					config.allowArbitraryNamedExports,
				);

				const dtsPath = `${file}.d.ts`;
				await fs.writeFile(dtsPath, dtsContent, 'utf8');
				console.log(`✓ ${dtsPath}`);
			} catch (error) {
				console.error(`✗ ${file}`);
				console.error(`  ${error instanceof Error ? error.message : String(error)}`);
				process.exitCode = 1;
			}
		}),
	);

	if (process.exitCode === 1) {
		console.error('\nFailed to generate types');
	} else {
		console.log(`\n✓ Successfully generated types for ${files.length} CSS Module(s)`);
	}
};
