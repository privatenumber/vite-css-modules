import { describe } from 'manten';

describe('vite-plugin-css-modules', ({ runTestSuite }) => {
	runTestSuite(import('./specs/reproductions.spec.js'));
	runTestSuite(import('./specs/patched/index.js'));
});
