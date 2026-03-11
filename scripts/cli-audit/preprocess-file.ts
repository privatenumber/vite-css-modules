/* eslint no-console: "off" */

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { makeLegalIdentifier } from '@rollup/pluginutils';
import { preprocessCSS } from 'vite';
import {
	findNearestViteConfig,
	formatJson,
	getAuditCwd,
	loadResolvedConfig,
	type ConfigLoaderName,
} from './shared.ts';

const loaders = ['bundle', 'runner', 'native'] as const;
const exportModes = ['both', 'named', 'default'] as const;

const printUsageAndExit = (message?: string): never => {
	if (message) {
		console.error(message);
		console.error('');
	}

	console.error('Usage: node scripts/cli-audit/preprocess-file.ts <file.module.css|scss> [--config path] [--cwd path] [--mode development] [--loader bundle|runner|native] [--export-mode both|named|default]');
	process.exit(1);
};

const buildDtsPreview = (
	exportNames: string[],
	exportMode: typeof exportModes[number],
) => {
	const lines = [
		'/* preview only */',
	];

	const seenVariables = new Set<string>();
	const exportedVariables: Array<[variableName: string, exportName: string]> = [];

	for (const exportName of exportNames) {
		const variableName = makeLegalIdentifier(exportName);
		if (!seenVariables.has(variableName)) {
			seenVariables.add(variableName);
			lines.push(`declare const ${variableName}: string;`);
		}

		exportedVariables.push([
			variableName,
			exportName === variableName
				? exportName
				: JSON.stringify(exportName),
		]);
	}

	if (exportMode === 'both' || exportMode === 'named') {
		lines.push('', 'export {');
		for (const [variableName, exportName] of exportedVariables) {
			if (exportMode === 'both' && exportName === '"default"') {
				continue;
			}

			lines.push(
				variableName === exportName
					? `\t${variableName},`
					: `\t${variableName} as ${exportName},`,
			);
		}
		lines.push('};');
	}

	if (exportMode === 'both' || exportMode === 'default') {
		lines.push('', 'declare const __default_export__: {');
		for (const [variableName, exportName] of exportedVariables) {
			lines.push(`\t${exportName}: typeof ${variableName};`);
		}
		lines.push('};', 'export default __default_export__;');
	}

	return lines;
};

const { values, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: {
		config: {
			type: 'string',
		},
		cwd: {
			type: 'string',
		},
		mode: {
			type: 'string',
			default: 'development',
		},
		loader: {
			type: 'string',
			default: 'bundle',
		},
		exportMode: {
			type: 'string',
			default: 'both',
		},
	},
	allowPositionals: true,
	strict: true,
});

if (positionals.length !== 1) {
	printUsageAndExit('Expected exactly one CSS Module file path.');
}

if (!loaders.includes(values.loader as ConfigLoaderName)) {
	printUsageAndExit(`Invalid loader: ${values.loader}`);
}

if (!exportModes.includes(values.exportMode as typeof exportModes[number])) {
	printUsageAndExit(`Invalid export mode: ${values.exportMode}`);
}

const filePath = path.resolve(positionals[0]!);
const configPath = values.config
	? path.resolve(values.config)
	: await findNearestViteConfig(filePath);

const resolvedConfigPath = configPath
	?? printUsageAndExit(`Could not find a vite config for: ${filePath}`);

const cwd = getAuditCwd(resolvedConfigPath, values.cwd);
const {
	resolvedConfig,
	pluginInfo,
	configPath: loadedConfigPath,
	cwd: loadedCwd,
} = await loadResolvedConfig(
	resolvedConfigPath,
	values.mode,
	values.loader as ConfigLoaderName,
	cwd,
);

const inputCss = await fs.readFile(filePath, 'utf8');
const preprocessed = await preprocessCSS(inputCss, filePath, resolvedConfig);
const moduleExports = preprocessed.modules ?? {};
const exportNames = Object.keys(moduleExports);

console.log(formatJson({
	filePath,
	configPath: loadedConfigPath,
	cwd: loadedCwd,
	transformer: resolvedConfig.css.transformer,
	patchCssModulesPluginCount: pluginInfo.patchCssModulesPlugins.length,
	patchCssModulesMetadataKeys: pluginInfo.patchCssModulesMetadataKeys,
	preprocess: {
		dependencyCount: preprocessed.deps?.size ?? 0,
		moduleCount: exportNames.length,
	},
	exports: exportNames,
	scopedPreview: Object.fromEntries(
		Object.entries(moduleExports).slice(0, 12),
	),
	dtsPreview: buildDtsPreview(
		exportNames,
		values.exportMode as typeof exportModes[number],
	).slice(0, 18),
}));
