import { version } from 'vite';
import { describe } from 'manten';

describe(`vite ${version}`, ({ runTestSuite }) => {
	runTestSuite(import('./specs/reproductions.spec.js'));
	runTestSuite(import('./specs/patched/index.js'));
	runTestSuite(import('./specs/cli.spec.js'));
});
