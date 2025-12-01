import { cli } from 'cleye';
import { generateTypesCommand } from './commands/generate-types/index.js';

cli({
	name: 'vite-css-modules',
	commands: [
		generateTypesCommand,
	],
}, () => {
	throw new Error('No command specified. Run with --help to see available commands.');
}).catch((error) => {
	console.error('Error:', (error as Error).message);
	process.exitCode = 1;
});
