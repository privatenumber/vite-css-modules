import { cli, command } from 'cleye';
import { generateTypesCommand } from './commands/generate-types.js';

const parsed = cli({
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
});

if (parsed instanceof Promise) {
	parsed.catch((error) => {
		console.error('Error:', error.message);
		process.exitCode = 1;
	});
} else if (!parsed.command) {
	console.error('Error: No command specified. Run with --help to see available commands.');
	process.exitCode = 1;
}
