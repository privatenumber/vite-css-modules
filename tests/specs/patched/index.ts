import { testSuite } from 'manten';

export default testSuite(({ describe }) => {
	describe('Patched', ({ runTestSuite }) => {
		runTestSuite(import('./postcss.spec.js'));
		runTestSuite(import('./lightningcss.spec.js'));
	});
});
