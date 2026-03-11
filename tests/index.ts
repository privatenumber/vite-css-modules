import { version } from 'vite';
import { describe } from 'manten';

await import('./specs/cli.spec.ts');

describe(`vite ${version}`, () => {
	import('./specs/reproductions.spec.ts');
	import('./specs/patched/index.ts');
});
