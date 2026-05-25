/* eslint-disable no-console */
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { supportsArbitraryModuleNamespace } from '../plugin/supports-arbitrary-module-namespace.js';
import { createCssModuleLoader } from './load-css-module.js';
import { generateDeclarationForFile } from './generate-declaration.js';
import { resolveGlobScope } from './glob-scope.js';
import {
	findViteConfigInDirectory,
	loadProjectContext,
} from './project-context.js';

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
			silent: {
				type: Boolean,
				alias: 's',
				description: 'Suppress success output',
			},
			watch: {
				type: Boolean,
				alias: 'w',
				description: 'Watch for changes and regenerate types',
			},
		},
	});

	const cwd = process.cwd();
	const { globs: inputGlobs = [] } = argv._;
	const { config, mode, silent, watch: watchMode } = argv.flags;
	const configPath = config
		? path.resolve(config)
		: await findViteConfigInDirectory(cwd);

	if (!configPath) {
		throw new Error(`No vite.config.* found in the current working directory: ${cwd}\nRun this command from the same cwd as Vite, or pass --config.`);
	}

	const projectContext = await loadProjectContext({
		configPath,
		mode,
	});
	const { root } = projectContext.resolvedConfig;
	const allowArbitraryNamedExports = supportsArbitraryModuleNamespace(projectContext.resolvedConfig);

	const { globs, globCwd } = resolveGlobScope(inputGlobs, cwd, root);

	const files = await glob(globs, {
		absolute: true,
		cwd: globCwd,
		ignore: ['**/node_modules/**'],
	});

	if (files.length === 0 && !watchMode) {
		console.error('No files matched the provided glob patterns');
		return;
	}

	const loadCssModule = createCssModuleLoader(projectContext);

	await Promise.all(files.map(filePath =>
		generateDeclarationForFile(
			projectContext,
			loadCssModule,
			cwd,
			filePath,
			allowArbitraryNamedExports,
			silent ?? false,
			!watchMode,
		),
	));

	if (watchMode) {
		const { runWatch } = await import('./watch.js');
		const cleanup = await runWatch({
			globs,
			globCwd,
			projectContext,
			loadCssModule,
			cwd,
			allowArbitraryNamedExports,
			hadInitialMatches: files.length > 0,
			silent: silent ?? false,
		});

		const shutdown = () => {
			cleanup().then(() => process.exit());
		};
		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);
	}
})().catch((error: Error) => {
	console.error(error.message);
	process.exitCode = 1;
});
/* eslint-enable no-console */
