import { cli, command } from 'cleye';
import { generateTypesCommand } from './commands/generate-types.js';

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

					help: {
						description: 'Generate TypeScript declaration files for CSS Modules',
					},
				}, async (argv) => {
					const directories = (
						argv._.directories && argv._.directories.length > 0
							? argv._.directories
							: [process.cwd()]
					);
					await generateTypesCommand(directories);
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
