import path from 'node:path';
import { EventEmitter } from 'node:events';
import { decode } from '@jridgewell/sourcemap-codec';
import { createFixture, type FileTree } from 'fs-fixture';
import {
	describe, test, expect, onFinish,
} from 'manten';
import spawn, { type Result, type SubprocessError } from 'nano-spawn';

const cliPath = path.resolve('dist/cli/index.mjs');
const cli = (
	args: string[],
	cwd: string,
	options?: {
		env?: NodeJS.ProcessEnv;
	},
): Promise<Result & { exitCode?: number }> => spawn(process.execPath, [cliPath, ...args], {
	cwd,
	env: {
		...process.env,
		...options?.env,
	},
})
	.catch((error: SubprocessError) => error);

const projectRoot = path.resolve('.');

const defaultProjectFiles: FileTree = {
	'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
	'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
};
`,
};

describe('CLI', () => {
	const previousMaxListeners = EventEmitter.defaultMaxListeners;
	EventEmitter.defaultMaxListeners = 0;
	onFinish(() => {
		EventEmitter.defaultMaxListeners = previousMaxListeners;
	});

	test('no arguments default to CSS Module globs under the resolved config root', async () => {
		await using fixture = await createFixture({
			'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
			'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
	root: 'client',
};`,
			'client/src/inside.module.css': '.inside { color: red; }',
			'outside.module.css': '.outside { color: blue; }',
		});

		const result = await cli([], fixture.path);
		expect(result.exitCode).toBeUndefined();
		expect(result.stdout).toMatch('client/src/inside.module.css.d.ts');
		expect(result.stdout).not.toMatch('outside.module.css.d.ts');
		expect(
			await fixture.readFile('client/src/inside.module.css.d.ts', 'utf8').catch(() => null),
		).not.toBe(null);
		expect(
			await fixture.readFile('outside.module.css.d.ts', 'utf8').catch(() => null),
		).toBe(null);
	});

	test('no arguments include .module.scss and .module.sass but not .module.less', async () => {
		await using fixture = await createFixture({
			...defaultProjectFiles,
			'src/style.module.scss': `.button {
	color: red;
}`,
			'src/style.module.sass': `.active
  color: blue`,
			'src/style.module.less': '.ignored { color: black; }',
		});

		const result = await cli([], fixture.path);
		expect(result.exitCode).toBeUndefined();
		expect(result.stdout).toMatch('src/style.module.scss.d.ts');
		expect(result.stdout).toMatch('src/style.module.sass.d.ts');
		expect(result.stdout).not.toMatch('src/style.module.less.d.ts');
		expect(
			await fixture.readFile('src/style.module.scss.d.ts', 'utf8').catch(() => null),
		).not.toBe(null);
		expect(
			await fixture.readFile('src/style.module.sass.d.ts', 'utf8').catch(() => null),
		).not.toBe(null);
		expect(
			await fixture.readFile('src/style.module.less.d.ts', 'utf8').catch(() => null),
		).toBe(null);
	});

	test('generates .d.ts for single CSS module', async () => {
		await using fixture = await createFixture({
			...defaultProjectFiles,
			'style.module.css': '.button { color: red; }',
		});

		const result = await cli(['style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();
		expect(result.stdout).toMatch('style.module.css.d.ts');

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const button: string');
		expect(dts).toMatch('export {');
		expect(dts).toMatch('export default');
	});

	test('generates .d.ts for glob pattern', async () => {
		await using fixture = await createFixture({
			...defaultProjectFiles,
			'src/a.module.css': '.alpha { color: red; }',
			'src/nested/b.module.css': '.beta { color: blue; }',
		});

		const result = await cli(['**/*.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();
		expect(result.stdout).toMatch('src/a.module.css.d.ts');
		expect(result.stdout).toMatch('src/nested/b.module.css.d.ts');

		const dtsA = await fixture.readFile('src/a.module.css.d.ts', 'utf8');
		expect(dtsA).toMatch('declare const alpha: string');

		const dtsB = await fixture.readFile('src/nested/b.module.css.d.ts', 'utf8');
		expect(dtsB).toMatch('declare const beta: string');
	});

	test('explicit globs are resolved from cwd instead of config root', async () => {
		await using fixture = await createFixture({
			'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
			'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
	root: 'client',
};`,
			'client/src/inside.module.css': '.inside { color: red; }',
			'outside.module.css': '.outside { color: blue; }',
		});

		const result = await cli(['*.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();
		expect(result.stdout).toMatch('outside.module.css.d.ts');
		expect(result.stdout).not.toMatch('client/src/inside.module.css.d.ts');
		expect(
			await fixture.readFile('outside.module.css.d.ts', 'utf8').catch(() => null),
		).not.toBe(null);
		expect(
			await fixture.readFile('client/src/inside.module.css.d.ts', 'utf8').catch(() => null),
		).toBe(null);
	});

	test('ignores node_modules when expanding glob patterns', async () => {
		await using fixture = await createFixture({
			...defaultProjectFiles,
			'src/a.module.css': '.alpha { color: red; }',
			'src/nested/b.module.css': '.beta { color: blue; }',
			'node_modules/pkg/ignored.module.css': '.ignored { color: black; }',
		});

		const result = await cli(['**/*.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();
		expect(result.stdout).toMatch('src/a.module.css.d.ts');
		expect(result.stdout).toMatch('src/nested/b.module.css.d.ts');
		expect(result.stdout).not.toMatch('node_modules/pkg/ignored.module.css.d.ts');
		expect(
			await fixture.readFile('node_modules/pkg/ignored.module.css.d.ts', 'utf8').catch(() => null),
		).toBe(null);
		expect(
			await fixture.readFile('src/a.module.css.d.ts', 'utf8').catch(() => null),
		).not.toBe(null);
	});

	test('no files matched shows warning on stderr', async () => {
		await using fixture = await createFixture({
			...defaultProjectFiles,
		});
		const result = await cli(['**/*.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();
		expect(result.stderr).toMatch('No files matched');
	});

	test('CSS parse error sets exit code 1', async () => {
		await using fixture = await createFixture({
			...defaultProjectFiles,
			'broken.module.css': '.button { color: ',
		});

		const result = await cli(['broken.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('broken.module.css');
		expect(result.stderr).toMatch('Unclosed block');
	});

	test('multiple files with one parse error continues others', async () => {
		await using fixture = await createFixture({
			...defaultProjectFiles,
			'good.module.css': '.button { color: red; }',
			'broken.module.css': '.button { color: ',
		});

		const result = await cli(['good.module.css', 'broken.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('broken.module.css');
		expect(result.stderr).toMatch('Unclosed block');

		const dts = await fixture.readFile('good.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const button: string');
	});

	test('composes from local classes', async () => {
		await using fixture = await createFixture({
			...defaultProjectFiles,
			'style.module.css': `.base { color: red; }
.button { composes: base; background: blue; }`,
		});

		const result = await cli(['style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const base: string');
		expect(dts).toMatch('declare const button: string');
	});

	test('explicit globs without vite config in cwd error before glob expansion', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await cli(
			['style.module.css'],
			fixture.path,
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('No vite.config.* found in the current working directory');
		expect(result.stderr).toMatch('Run this command from the same cwd as Vite, or pass --config.');
	});

	test('explicit globs without vite config in cwd error even when nothing matches', async () => {
		await using fixture = await createFixture({});

		const result = await cli(['**/*.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('No vite.config.* found in the current working directory');
		expect(result.stderr).not.toMatch('No files matched');
	});

	test('invalid explicit --config errors before glob expansion', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await cli(
			['--config', 'missing/vite.config.mjs', 'style.module.css'],
			fixture.path,
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('vite.config.mjs');
	});

	test('invalid explicit --config errors even when nothing matches', async () => {
		await using fixture = await createFixture({});

		const result = await cli(
			['--config', 'missing/vite.config.mjs', '**/*.module.css'],
			fixture.path,
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('vite.config.mjs');
		expect(result.stderr).not.toMatch('No files matched');
	});

	test('broken discovered vite config errors before glob expansion', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
			'vite.config.mjs': 'throw new Error("broken config");',
		});

		const result = await cli(
			['style.module.css'],
			fixture.path,
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('broken config');
	});

	test('broken discovered vite config errors even when nothing matches', async () => {
		await using fixture = await createFixture({
			'vite.config.mjs': 'throw new Error("broken config");',
		});

		const result = await cli(['**/*.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('broken config');
		expect(result.stderr).not.toMatch('No files matched');
	});

	test('no arguments error when the resolved config root is outside cwd', async () => {
		await using fixture = await createFixture({
			'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
			'project/node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
			'project/vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
	root: '../shared',
};`,
			'shared/src/style.module.css': '.button { color: red; }',
		});

		const result = await cli([], path.join(fixture.path, 'project'));
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('Resolved Vite root is outside the current working directory');
		expect(result.stderr).toMatch('Pass explicit globs to control the search scope.');
	});

	describe('project mode expectations', () => {
		test('loads TypeScript vite config with imported base config by default', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'base.ts': `export default {
	css: {
		modules: {
			localsConvention: 'camelCaseOnly',
		},
	},
};`,
				'vite.config.ts': `import { patchCssModules } from 'vite-css-modules';
import base from './base.ts';

export default {
	...base,
	plugins: [patchCssModules()],
	root: __dirname,
};`,
				'style.module.css': '.my-button { color: red; }',
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const myButton: string');
			expect(dts).not.toMatch('"my-button"');
		});

		test('uses explicit --config path', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'config/vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
	css: {
		modules: {
			localsConvention: 'camelCaseOnly',
		},
	},
};`,
				'style.module.css': '.my-button { color: red; }',
			});

			const result = await cli(
				['--config', 'config/vite.config.mjs', 'style.module.css'],
				fixture.path,
			);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const myButton: string');
			expect(dts).not.toMatch('"my-button"');
		});

		test('no arguments use explicit --config path and its resolved root', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'config/vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
	root: '../client',
	css: {
		modules: {
			localsConvention: 'camelCaseOnly',
		},
	},
};`,
				'client/src/style.module.css': '.my-button { color: red; }',
				'style.module.css': '.outside { color: blue; }',
			});

			const result = await cli(
				['--config', 'config/vite.config.mjs'],
				fixture.path,
			);
			expect(result.exitCode).toBeUndefined();
			expect(result.stdout).toMatch('client/src/style.module.css.d.ts');

			const dts = await fixture.readFile('client/src/style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const myButton: string');
			expect(dts).not.toMatch('"my-button"');
			expect(
				await fixture.readFile('style.module.css.d.ts', 'utf8').catch(() => null),
			).toBe(null);
		});

		test('uses --mode for Vite config loading', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'style.module.css': '.my-button { color: red; }',
				'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default ({ mode }) => ({
	plugins: [patchCssModules()],
	css: {
		modules: {
			localsConvention: mode === 'production'
				? 'camelCaseOnly'
				: 'camelCase',
		},
	},
});`,
			});

			const result = await cli(
				['--mode', 'production', 'style.module.css'],
				fixture.path,
			);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const myButton: string');
			expect(dts).not.toMatch('"my-button"');
		});

		test('uses vite config localsConvention by default', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'style.module.css': '.my-button { color: red; }',
				'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
	css: {
		modules: {
			localsConvention: 'camelCaseOnly',
		},
	},
};`,
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const myButton: string');
			expect(dts).not.toMatch('"my-button"');
		});

		test('uses vite config exportGlobals by default', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'style.module.css': ':global(.global-class) { color: red; }',
				'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
	css: {
		modules: {
			exportGlobals: true,
		},
	},
};`,
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('"global-class"');
		});

		test('uses vite config globalModulePaths by default', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'global.module.css': `.page { color: red; }
:local(.title) { color: blue; }`,
				'vite.config.mjs': String.raw`
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
	css: {
		modules: {
			globalModulePaths: [/global\.module\.css/],
		},
	},
};`,
			});

			const result = await cli(['global.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('global.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const title: string');
			expect(dts).not.toMatch('declare const page: string');
		});

		test('uses vite config function localsConvention by default', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'style.module.css': '.my-button { color: red; }',
				'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
	css: {
		modules: {
			localsConvention: () => 'customName',
		},
	},
};`,
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('customName');
			expect(dts).not.toMatch('"my-button"');
		});

		test('auto-detects declarationMap from tsconfig.json', async () => {
			await using fixture = await createFixture({
				...defaultProjectFiles,
				'style.module.css': '.button { color: red; }',
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						declarationMap: true,
					},
				}),
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();
			expect(result.stdout).toMatch('style.module.css.d.ts');

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('sourceMappingURL=data:application/json;charset=utf-8;base64,');

			const match = dts.match(/sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)/);
			const dtsMap = JSON.parse(Buffer.from(match![1]!, 'base64').toString('utf8')) as {
				file: string;
				mappings: string;
				sources: string[];
				version: number;
			};

			expect(dtsMap.version).toBe(3);
			expect(dtsMap.file).toBe('style.module.css.d.ts');
			expect(dtsMap.sources).toStrictEqual(['style.module.css']);
			const declarationLine = dts.split('\n').findIndex(line => line.includes('declare const button: string;'));
			expect(declarationLine).toBeGreaterThanOrEqual(0);
			expect(decode(dtsMap.mappings)[declarationLine]).toStrictEqual([[14, 0, 0, 0]]);
		});

		test('updates generated outputs when resolved Vite config changes', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'style.module.css': '.my-button { color: red; }',
				'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
export default {
	plugins: [patchCssModules()],
	css: {
		modules: {
			localsConvention: process.env.USE_CAMEL_CASE === '1'
				? 'camelCaseOnly'
				: undefined,
		},
	},
};`,
			});

			const firstRun = await cli(
				['style.module.css'],
				fixture.path,
				{
					env: {
						USE_CAMEL_CASE: '0',
					},
				},
			);
			expect(firstRun.exitCode).toBeUndefined();
			expect(await fixture.readFile('style.module.css.d.ts', 'utf8')).toMatch('"my-button"');

			const secondRun = await cli(
				['style.module.css'],
				fixture.path,
				{
					env: {
						USE_CAMEL_CASE: '1',
					},
				},
			);
			expect(secondRun.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const myButton: string');
			expect(dts).not.toMatch('"my-button"');
		});

		test('updates generated outputs for SCSS files with partial dependencies', async () => {
			await using fixture = await createFixture({
				...defaultProjectFiles,
				'_shared.scss': '.injected { color: red; }',
				'style.module.scss': `@use './shared';
.local { color: blue; }`,
			});

			const firstRun = await cli(['style.module.scss'], fixture.path);
			expect(firstRun.exitCode).toBeUndefined();
			expect(await fixture.readFile('style.module.scss.d.ts', 'utf8')).toMatch('declare const injected: string');

			await fixture.writeFile('_shared.scss', '.changed { color: red; }');

			const secondRun = await cli(
				['style.module.scss'],
				fixture.path,
			);
			expect(secondRun.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.scss.d.ts', 'utf8');
			expect(dts).toMatch('declare const changed: string');
			expect(dts).not.toMatch('declare const injected: string');
		});

		test('revalidates dependency-based outputs when dependencies change', async () => {
			await using fixture = await createFixture({
				...defaultProjectFiles,
				'dep.module.css': '.base { color: red; }',
				'style.module.css': '.button { composes: base from "./dep.module.css"; }',
			});

			const firstRun = await cli(['style.module.css'], fixture.path);
			expect(firstRun.exitCode).toBeUndefined();

			await fixture.writeFile('dep.module.css', '.other { color: blue; }');

			const secondRun = await cli(
				['style.module.css'],
				fixture.path,
				{
					env: {
						DEBUG: 'vite-css-modules:*',
					},
				},
			);

			expect(secondRun.exitCode).toBe(1);
			expect(secondRun.stderr).toMatch('base');
			expect(secondRun.stderr).toMatch('dep.module.css');
		});

		test('supports SCSS line comments', async () => {
			await using fixture = await createFixture({
				...defaultProjectFiles,
				'style.module.scss': `// comment
.button {
	color: red;
}`,
			});

			const result = await cli(['style.module.scss'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.scss.d.ts', 'utf8');
			expect(dts).toMatch('declare const button: string');
		});

		test('supports Sass indented syntax', async () => {
			await using fixture = await createFixture({
				...defaultProjectFiles,
				'style.module.sass': `.button
  color: red

  &.active
    color: blue`,
			});

			const result = await cli(['style.module.sass'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.sass.d.ts', 'utf8');
			expect(dts).toMatch('declare const button: string');
			expect(dts).toMatch('declare const active: string');
		});

		test('surfaces Vite config loading failures', async () => {
			await using fixture = await createFixture({
				'style.module.css': '.button { color: red; }',
				'vite.config.mjs': 'throw new Error("config should load");',
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('config should load');
		});

		test('resolves alias-based dependency errors through vite resolve.alias', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'styles/base.module.css': '.base { color: red; }',
				'style.module.css': '.button { composes: missing from "#styles/base.module.css"; }',
				'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
import { fileURLToPath } from 'node:url';

export default {
	plugins: [patchCssModules()],
	resolve: {
		alias: {
			'#styles': fileURLToPath(new URL('./styles', import.meta.url)),
		},
	},
};`,
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('#styles/base.module.css');
			expect(result.stderr).toMatch('missing');
		});

		test('resolves alias-based dependency success through vite resolve.alias', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'styles/base.module.css': '.base { color: red; }',
				'style.module.css': '.button { composes: base from "#styles/base.module.css"; }',
				'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';
import { fileURLToPath } from 'node:url';

export default {
	plugins: [patchCssModules()],
	resolve: {
		alias: {
			'#styles': fileURLToPath(new URL('./styles', import.meta.url)),
		},
	},
};`,
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const button: string');
		});

		test('errors on unresolved composes dependency files', async () => {
			await using fixture = await createFixture({
				...defaultProjectFiles,
				'style.module.css': '.button { composes: base from "./missing.module.css"; }',
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('missing.module.css');
		});

		test('errors on unresolved composes exports', async () => {
			await using fixture = await createFixture({
				...defaultProjectFiles,
				'dep.module.css': '.base { color: red; }',
				'style.module.css': '.button { composes: missing from "./dep.module.css"; }',
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('missing');
			expect(result.stderr).toMatch('dep.module.css');
		});

		test('errors on unresolved @value dependencies', async () => {
			await using fixture = await createFixture({
				...defaultProjectFiles,
				'style.module.css': `@value color from "./missing.css";
.button {
	color: color;
}`,
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('missing.css');
		});
	});

	describe('plugin detection', () => {
		test('errors when vite config has no patchCssModules plugin', async () => {
			await using fixture = await createFixture({
				'style.module.css': '.button { color: red; }',
				'vite.config.mjs': 'export default {};',
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('patchCssModules');
		});

		test('errors when patchCssModules is imported but not in plugins', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'style.module.css': '.button { color: red; }',
				'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';

// Conditionally excluded — plugin not actually used
const plugins = [];

export default { plugins };
`,
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('patchCssModules');
		});

		test('errors when css.modules is explicitly false', async () => {
			await using fixture = await createFixture({
				'style.module.css': '.button { color: red; }',
				'vite.config.mjs': `export default {
	css: {
		modules: false,
	},
};`,
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
		});

		test('uses exportMode from patchCssModules config', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'style.module.css': '.button { color: red; }',
				'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';

export default {
	plugins: [
		patchCssModules({ exportMode: 'default' }),
	],
};
`,
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			// exportMode: 'default' means no named exports, only default export
			expect(dts).not.toMatch('export {');
			expect(dts).toMatch('export default');
		});

		test('uses exportMode named from patchCssModules config', async () => {
			await using fixture = await createFixture({
				'node_modules/vite-css-modules': ({ symlink }) => symlink(projectRoot),
				'style.module.css': '.button { color: red; }',
				'vite.config.mjs': `
import { patchCssModules } from 'vite-css-modules';

export default {
	plugins: [
		patchCssModules({ exportMode: 'named' }),
	],
};
`,
			});

			const result = await cli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			// exportMode: 'named' means named exports only, no default export
			expect(dts).toMatch('export {');
			expect(dts).not.toMatch('export default');
		});
	});
}, { parallel: 4 });
