/* eslint no-console: "off" */

import path from 'node:path';
import { parseArgs } from 'node:util';
import {
	fileExists,
	findNearestViteConfig,
	formatJson,
	getAuditCwd,
	loadResolvedConfig,
	loadUserConfig,
	summarizeResolvedConfig,
	type ConfigLoaderName,
} from './shared.ts';

const loaders = ['bundle', 'runner', 'native'] as const;

const printUsageAndExit = (message?: string) => {
	if (message) {
		console.error(message);
		console.error('');
	}

	console.error('Usage: node scripts/cli-audit/load-config.ts <path...> [--mode development] [--cwd path] [--loader all|bundle|runner|native]');
	process.exit(1);
};

const { values, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: {
		mode: {
			type: 'string',
			default: 'development',
		},
		cwd: {
			type: 'string',
		},
		loader: {
			type: 'string',
			default: 'all',
		},
	},
	allowPositionals: true,
	strict: true,
});

if (positionals.length === 0) {
	printUsageAndExit('Expected at least one config, directory, or CSS Module file path.');
}

let selectedLoaders: readonly ConfigLoaderName[] = loaders;
if (values.loader !== 'all') {
	if (!loaders.includes(values.loader as ConfigLoaderName)) {
		printUsageAndExit(`Invalid loader: ${values.loader}`);
	}

	selectedLoaders = [values.loader as ConfigLoaderName];
}

for (const target of positionals) {
	const absoluteTarget = path.resolve(target);
	let configPath: string | null = null;
	if (await fileExists(absoluteTarget)) {
		configPath = (
			absoluteTarget.endsWith('vite.config.ts')
			|| absoluteTarget.endsWith('vite.config.mts')
			|| absoluteTarget.endsWith('vite.config.cts')
			|| absoluteTarget.endsWith('vite.config.js')
			|| absoluteTarget.endsWith('vite.config.mjs')
			|| absoluteTarget.endsWith('vite.config.cjs')
		)
			? absoluteTarget
			: await findNearestViteConfig(absoluteTarget);
	}

	console.log(`\n# ${absoluteTarget}`);

	if (!configPath) {
		console.log('No vite config found.');
		continue;
	}

	console.log(`config: ${configPath}`);
	console.log(`cwd: ${getAuditCwd(configPath, values.cwd)}`);

	for (const loader of selectedLoaders) {
		try {
			const loaded = await loadUserConfig(
				configPath,
				values.mode,
				loader,
				getAuditCwd(configPath, values.cwd),
			);
			const { pluginInfo, resolvedConfig, dependencies } = await loadResolvedConfig(
				configPath,
				values.mode,
				loader,
				getAuditCwd(configPath, values.cwd),
			);

			console.log(`\n[${loader}] ok`);
			console.log(formatJson({
				configPath: loaded.path,
				dependencyCount: dependencies.length,
				pluginCount: pluginInfo.plugins.length,
				patchCssModulesPluginCount: pluginInfo.patchCssModulesPlugins.length,
				patchCssModulesMetadataKeys: pluginInfo.patchCssModulesMetadataKeys,
				firstPlugins: pluginInfo.pluginNames.slice(0, 12),
				summary: summarizeResolvedConfig(resolvedConfig),
			}));
		} catch (error) {
			console.log(`\n[${loader}] failed`);
			console.log(
				formatJson({
					error: error instanceof Error
						? error.message
						: String(error),
				}),
			);
		}
	}
}
