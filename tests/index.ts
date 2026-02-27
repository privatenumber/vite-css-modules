import { version } from 'vite';
import { describe } from 'manten';

describe(`vite ${version}`, () => {
	import('./specs/reproductions.spec.ts');
	import('./specs/patched/index.ts');
});

describe('CLI', ({ runTestSuite }) => {
	runTestSuite(import('./specs/cli.spec.js'));
});
