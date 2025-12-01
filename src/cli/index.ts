import { cli, command } from 'cleye';
import { generateTypesCommand } from './commands/generate-types.js';

const exportModes = ['both', 'named', 'default'] as const;
const localsConventions = ['camelCase', 'camelCaseOnly', 'dashes', 'dashesOnly'] as const;

(async () => {
	try {
		await cli({
			name: 'vite-css-modules',

			commands: [
				command({
					name: 'generate-types',

					parameters: [
						'[directories...]',
					],

					flags: {
						exportMode: {
							type: String,
							alias: 'e',
							description: `Export style: ${exportModes.join(', ')} (default: both)`,
						},
						localsConvention: {
							type: String,
							alias: 'l',
							description: `Class name transformation: ${localsConventions.join(', ')}`,
						},
						target: {
							type: String,
							description: 'Build target for arbitrary module namespace (e.g. es2022, esnext, chrome90)',
						},
					},

					help: {
						description: 'Generate TypeScript declaration files for CSS Modules',
					},
				}, async (argv) => {
					const directories = (
						argv._.directories && argv._.directories.length > 0
							? argv._.directories
							: [process.cwd()]
					);

					const { exportMode, localsConvention, target } = argv.flags;

					if (exportMode && !exportModes.includes(exportMode as typeof exportModes[number])) {
						throw new Error(`Invalid --export-mode: ${exportMode}. Must be one of: ${exportModes.join(', ')}`);
					}

					if (
						localsConvention
						&& !localsConventions.includes(localsConvention as typeof localsConventions[number])
					) {
						throw new Error(`Invalid --locals-convention: ${localsConvention}. Must be one of: ${localsConventions.join(', ')}`);
					}

					await generateTypesCommand(directories, {
						exportMode: (exportMode as typeof exportModes[number]) ?? 'both',
						localsConvention: localsConvention as typeof localsConventions[number],
						target,
					});
				}),
			],
		}, () => {
			throw new Error('No command specified. Run with --help to see available commands.');
		});
	} catch (error) {
		console.error('Error:', (error as Error).message);
		process.exitCode = 1;
	}
})();
