import { green, red, yellow } from 'yoctocolors';
import type { ProcessResult, ErrorResult } from './process-file.js';

const successIcon = green('✔');
const failureIcon = red('✖');
const warningIcon = yellow('⚠');

export const reportResults = (
	results: ProcessResult[],
	totalFiles: number,
): void => {
	// Print successful results in sorted order
	for (const result of results) {
		if ('dtsPath' in result) {
			console.log(result.dtsPath);
		}
	}

	const failedFiles = results.filter((r): r is ErrorResult => 'error' in r);

	if (failedFiles.length > 0) {
		const sassNotFoundFailures = failedFiles.filter(f => f.errorType === 'sass-not-found');
		const preprocessorFailures = failedFiles.filter(f => f.errorType === 'preprocessor');
		const otherFailures = failedFiles.filter(f => f.errorType === 'other');

		console.error(`\n${failureIcon} Failed to generate types for ${failedFiles.length.toLocaleString()} file(s)`);
		process.exitCode = 1;

		if (sassNotFoundFailures.length > 0) {
			console.error(`\n${warningIcon} ${sassNotFoundFailures.length.toLocaleString()} file(s) missing sass compiler:`);
			for (const { file, error } of sassNotFoundFailures) {
				console.error(`  - ${file}`);
				console.error(`    ${error}`);
			}
			console.error('\n  Install `sass` or `sass-embedded` in the package containing these files.');
		}

		if (preprocessorFailures.length > 0) {
			console.error(`\n${warningIcon} ${preprocessorFailures.length.toLocaleString()} file(s) with preprocessor syntax errors:`);
			for (const { file, error } of preprocessorFailures) {
				console.error(`  - ${file}`);
				console.error(`    ${error}`);
			}
			console.error('\n  These files may use syntax that failed to compile (e.g. invalid SCSS).');
		}

		if (otherFailures.length > 0) {
			console.error(`\n${otherFailures.length.toLocaleString()} file(s) with other errors:`);
			for (const { file, error } of otherFailures) {
				console.error(`  - ${file}`);
				console.error(`    ${error}`);
			}
		}
	} else {
		console.log(`\n${successIcon} Successfully generated types for ${totalFiles.toLocaleString()} CSS Module(s)`);
	}
};
