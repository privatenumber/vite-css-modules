import path from 'node:path';
import { EventEmitter } from 'node:events';
import { decode } from '@jridgewell/sourcemap-codec';
import { createFixture } from 'fs-fixture';
import {
	describe, test, expect, onFinish,
} from 'manten';
import spawn, { type Result, type SubprocessError } from 'nano-spawn';

const cliPath = path.resolve('dist/cli/index.mjs');
const runCli = (
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

const createProjectFixture = (
	files: Record<string, string>,
) => createFixture({
	'vite.config.mjs': 'export default {};',
	...files,
});

describe('CLI', () => {
	const previousMaxListeners = EventEmitter.defaultMaxListeners;
	EventEmitter.defaultMaxListeners = 0;
	onFinish(() => {
		EventEmitter.defaultMaxListeners = previousMaxListeners;
	});

	test('no arguments default to CSS Module globs under the resolved config root', async () => {
		await using fixture = await createFixture({
			'vite.config.mjs': `export default {
	root: 'client',
};`,
			'client/src/inside.module.css': '.inside { color: red; }',
			'outside.module.css': '.outside { color: blue; }',
		});

		const result = await runCli([], fixture.path);
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
		await using fixture = await createProjectFixture({
			'src/style.module.scss': `.button {
	color: red;
}`,
			'src/style.module.sass': `.active
  color: blue`,
			'src/style.module.less': '.ignored { color: black; }',
		});

		const result = await runCli([], fixture.path);
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
		await using fixture = await createProjectFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();
		expect(result.stdout).toMatch('style.module.css.d.ts');

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const button: string');
		expect(dts).toMatch('export {');
		expect(dts).toMatch('export default');
	});

	test('generates .d.ts for glob pattern', async () => {
		await using fixture = await createProjectFixture({
			'src/a.module.css': '.alpha { color: red; }',
			'src/nested/b.module.css': '.beta { color: blue; }',
		});

		const result = await runCli(['**/*.module.css'], fixture.path);
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
			'vite.config.mjs': `export default {
	root: 'client',
};`,
			'client/src/inside.module.css': '.inside { color: red; }',
			'outside.module.css': '.outside { color: blue; }',
		});

		const result = await runCli(['*.module.css'], fixture.path);
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
		await using fixture = await createProjectFixture({
			'src/a.module.css': '.alpha { color: red; }',
			'src/nested/b.module.css': '.beta { color: blue; }',
			'node_modules/pkg/ignored.module.css': '.ignored { color: black; }',
		});

		const result = await runCli(['**/*.module.css'], fixture.path);
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

	test('DEBUG=vite-css-modules:* emits progress logs to stderr', async () => {
		await using fixture = await createProjectFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(
			['style.module.css'],
			fixture.path,
			{
				env: {
					DEBUG: 'vite-css-modules:*',
				},
			},
		);
		expect(result.exitCode).toBeUndefined();
		expect(result.stderr).toMatch('vite-css-modules:cli matched files');
		expect(result.stderr).toMatch(/durationMs: \d+/);
		expect(result.stderr).toMatch('vite-css-modules:transform preprocessed css module');
		expect(result.stderr).toMatch('vite-css-modules:cli processed file');
	});

	test('DEBUG=vite-css-modules:* logs files outside the selected config root', async () => {
		await using fixture = await createFixture({
			'vite.config.mjs': `export default {
	root: 'client',
};`,
			'client/inside.module.css': '.inside { color: red; }',
			'outside.module.css': '.outside { color: blue; }',
		});

		const result = await runCli(
			['*.module.css', 'client/*.module.css'],
			fixture.path,
			{
				env: {
					DEBUG: 'vite-css-modules:*',
				},
			},
		);

		expect(result.exitCode).toBeUndefined();
		expect(result.stderr).toMatch('vite-css-modules:cli matched file is outside config root');
		expect(result.stderr).toMatch("filePath: 'outside.module.css'");
		expect(result.stderr).toMatch("root: 'client'");
	});

	test('no files matched shows warning on stderr', async () => {
		await using fixture = await createFixture({});
		const result = await runCli(['**/*.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();
		expect(result.stderr).toMatch('No files matched');
	});

	test('CSS parse error sets exit code 1', async () => {
		await using fixture = await createProjectFixture({
			'broken.module.css': '.button { color: ',
		});

		const result = await runCli(['broken.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('broken.module.css');
		expect(result.stderr).toMatch('Unclosed block');
	});

	test('multiple files with one parse error continues others', async () => {
		await using fixture = await createProjectFixture({
			'good.module.css': '.button { color: red; }',
			'broken.module.css': '.button { color: ',
		});

		const result = await runCli(['good.module.css', 'broken.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('broken.module.css');
		expect(result.stderr).toMatch('Unclosed block');

		const dts = await fixture.readFile('good.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const button: string');
	});

	test('composes from local classes', async () => {
		await using fixture = await createProjectFixture({
			'style.module.css': `.base { color: red; }
.button { composes: base; background: blue; }`,
		});

		const result = await runCli(['style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const base: string');
		expect(dts).toMatch('declare const button: string');
	});

	test('matched files without vite config in cwd errors', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['style.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('No vite.config.* found in the current working directory');
		expect(result.stderr).toMatch('Run this command from the same cwd as Vite, or pass --config.');
	});

	test('no arguments error when the resolved config root is outside cwd', async () => {
		await using fixture = await createFixture({
			'project/vite.config.mjs': `export default {
	root: '../shared',
};`,
			'shared/src/style.module.css': '.button { color: red; }',
		});

		const result = await runCli([], path.join(fixture.path, 'project'));
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('Resolved Vite root is outside the current working directory');
		expect(result.stderr).toMatch('Pass explicit globs to control the search scope.');
	});

	describe('project mode expectations', () => {
		test('loads TypeScript vite config with imported base config by default', async () => {
			await using fixture = await createFixture({
				'base.ts': `export default {
	css: {
		modules: {
			localsConvention: 'camelCaseOnly',
		},
	},
};`,
				'vite.config.ts': `import base from './base.ts';

export default {
	...base,
	root: __dirname,
};`,
				'style.module.css': '.my-button { color: red; }',
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const myButton: string');
			expect(dts).not.toMatch('"my-button"');
		});

		test('uses explicit --config path', async () => {
			await using fixture = await createFixture({
				'config/vite.config.mjs': `export default {
	css: {
		modules: {
			localsConvention: 'camelCaseOnly',
		},
	},
};`,
				'style.module.css': '.my-button { color: red; }',
			});

			const result = await runCli(
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
				'config/vite.config.mjs': `export default {
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

			const result = await runCli(
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
				'style.module.css': '.my-button { color: red; }',
				'vite.config.mjs': `export default ({ mode }) => ({
	css: {
		modules: {
			localsConvention: mode === 'production'
				? 'camelCaseOnly'
				: 'camelCase',
		},
	},
});`,
			});

			const result = await runCli(
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
				'style.module.css': '.my-button { color: red; }',
				'vite.config.mjs': `export default {
	css: {
		modules: {
			localsConvention: 'camelCaseOnly',
		},
	},
};`,
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const myButton: string');
			expect(dts).not.toMatch('"my-button"');
		});

		test('uses vite config exportGlobals by default', async () => {
			await using fixture = await createFixture({
				'style.module.css': ':global(.global-class) { color: red; }',
				'vite.config.mjs': `export default {
	css: {
		modules: {
			exportGlobals: true,
		},
	},
};`,
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('"global-class"');
		});

		test('uses vite config globalModulePaths by default', async () => {
			await using fixture = await createFixture({
				'global.module.css': `.page { color: red; }
:local(.title) { color: blue; }`,
				'vite.config.mjs': String.raw`export default {
	css: {
		modules: {
			globalModulePaths: [/global\.module\.css/],
		},
	},
};`,
			});

			const result = await runCli(['global.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('global.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const title: string');
			expect(dts).not.toMatch('declare const page: string');
		});

		test('uses vite config function localsConvention by default', async () => {
			await using fixture = await createFixture({
				'style.module.css': '.my-button { color: red; }',
				'vite.config.mjs': `export default {
	css: {
		modules: {
			localsConvention: () => 'customName',
		},
	},
};`,
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('customName');
			expect(dts).not.toMatch('"my-button"');
		});

		test('auto-detects declarationMap from tsconfig.json', async () => {
			await using fixture = await createProjectFixture({
				'style.module.css': '.button { color: red; }',
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						declarationMap: true,
					},
				}),
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();
			expect(result.stdout).toMatch('style.module.css.d.ts');
			expect(result.stdout).toMatch('style.module.css.d.ts.map');

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			const dtsMap = JSON.parse(await fixture.readFile('style.module.css.d.ts.map', 'utf8')) as {
				file: string;
				mappings: string;
				sources: string[];
				version: number;
			};

			expect(dts).toMatch('sourceMappingURL=style.module.css.d.ts.map');
			expect(dtsMap?.version).toBe(3);
			expect(dtsMap?.file).toBe('style.module.css.d.ts');
			expect(dtsMap?.sources).toStrictEqual(['style.module.css']);
			const declarationLine = dts.split('\n').findIndex(line => line.includes('declare const button: string;'));
			expect(declarationLine).toBeGreaterThanOrEqual(0);
			expect(decode(dtsMap!.mappings)[declarationLine]).toStrictEqual([[14, 0, 0, 0]]);
		});

		test('removes stale .d.ts.map when declaration maps are not emitted', async () => {
			await using fixture = await createProjectFixture({
				'style.module.css': '.button { color: red; }',
				'style.module.css.d.ts': `declare const button: string;
//# sourceMappingURL=style.module.css.d.ts.map
`,
				'style.module.css.d.ts.map': '{"version":3}',
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();
			expect(result.stdout).toMatch('style.module.css.d.ts');
			expect(result.stdout).not.toMatch('style.module.css.d.ts.map');

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).not.toMatch('sourceMappingURL');
			expect(
				await fixture.readFile('style.module.css.d.ts.map', 'utf8').catch(() => null),
			).toBe(null);
		});

		test('reuses cached outputs for unchanged standalone modules', async () => {
			await using fixture = await createProjectFixture({
				'style.module.css': '.button { color: red; }',
			});

			const firstRun = await runCli(['style.module.css'], fixture.path);
			expect(firstRun.exitCode).toBeUndefined();

			const secondRun = await runCli(
				['style.module.css'],
				fixture.path,
				{
					env: {
						DEBUG: 'vite-css-modules:*',
					},
				},
			);
			expect(secondRun.exitCode).toBeUndefined();
			expect(secondRun.stderr).toMatch('vite-css-modules:cli cache hit');
			expect(secondRun.stderr).not.toMatch('vite-css-modules:transform preprocessing css module');

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('vite-css-modules');
			expect(dts).toMatch(/\* Hash: [a-f0-9]{16}/);
		});

		test('does not reuse cached outputs when dependency validation can change', async () => {
			await using fixture = await createProjectFixture({
				'dep.module.css': '.base { color: red; }',
				'style.module.css': '.button { composes: base from "./dep.module.css"; }',
			});

			const firstRun = await runCli(['style.module.css'], fixture.path);
			expect(firstRun.exitCode).toBeUndefined();
			expect(await fixture.readFile('style.module.css.d.ts', 'utf8')).not.toMatch(/\* Hash: [a-f0-9]{16}/);

			await fixture.writeFile('dep.module.css', '.other { color: blue; }');

			const secondRun = await runCli(
				['style.module.css'],
				fixture.path,
				{
					env: {
						DEBUG: 'vite-css-modules:*',
					},
				},
			);

			expect(secondRun.exitCode).toBe(1);
			expect(secondRun.stderr).not.toMatch('vite-css-modules:cli cache hit');
			expect(secondRun.stderr).toMatch('base');
			expect(secondRun.stderr).toMatch('dep.module.css');
		});

		test('supports SCSS line comments', async () => {
			await using fixture = await createProjectFixture({
				'style.module.scss': `// comment
.button {
	color: red;
}`,
			});

			const result = await runCli(['style.module.scss'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.scss.d.ts', 'utf8');
			expect(dts).toMatch('declare const button: string');
		});

		test('supports Sass indented syntax', async () => {
			await using fixture = await createProjectFixture({
				'style.module.sass': `.button
  color: red

  &.active
    color: blue`,
			});

			const result = await runCli(['style.module.sass'], fixture.path);
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

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('config should load');
		});

		test('resolves alias-based dependency errors through vite resolve.alias', async () => {
			await using fixture = await createFixture({
				'styles/base.module.css': '.base { color: red; }',
				'style.module.css': '.button { composes: missing from "#styles/base.module.css"; }',
				'vite.config.mjs': `import { fileURLToPath } from 'node:url';

export default {
	resolve: {
		alias: {
			'#styles': fileURLToPath(new URL('./styles', import.meta.url)),
		},
	},
};`,
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('#styles/base.module.css');
			expect(result.stderr).toMatch('missing');
		});

		test('resolves alias-based dependency success through vite resolve.alias', async () => {
			await using fixture = await createFixture({
				'styles/base.module.css': '.base { color: red; }',
				'style.module.css': '.button { composes: base from "#styles/base.module.css"; }',
				'vite.config.mjs': `import { fileURLToPath } from 'node:url';

export default {
	resolve: {
		alias: {
			'#styles': fileURLToPath(new URL('./styles', import.meta.url)),
		},
	},
};`,
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const button: string');
		});

		test('errors on unresolved composes dependency files', async () => {
			await using fixture = await createProjectFixture({
				'style.module.css': '.button { composes: base from "./missing.module.css"; }',
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('missing.module.css');
		});

		test('errors on unresolved composes exports', async () => {
			await using fixture = await createProjectFixture({
				'dep.module.css': '.base { color: red; }',
				'style.module.css': '.button { composes: missing from "./dep.module.css"; }',
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('missing');
			expect(result.stderr).toMatch('dep.module.css');
		});

		test('errors on unresolved @value dependencies', async () => {
			await using fixture = await createProjectFixture({
				'style.module.css': `@value color from "./missing.css";
.button {
	color: color;
}`,
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('missing.css');
		});
	});
}, { parallel: 4 });
