import { version } from 'vite';
import { describe } from 'manten';

describe(`vite ${version}`, () => {
	import('./specs/reproductions.spec.ts');
	import('./specs/patched/index.ts');
});

