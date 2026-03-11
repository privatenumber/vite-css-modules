import path from 'node:path';
import { EventEmitter } from 'node:events';
import { decode } from '@jridgewell/sourcemap-codec';
import { createFixture } from 'fs-fixture';
import { describe, test, expect, onFinish } from 'manten';
import spawn, { type Result, type SubprocessError } from 'nano-spawn';

const cliPath = path.resolve('dist/cli/index.mjs');
const runCli = (
	args: string[],
	cwd: string,
): Promise<Result & { exitCode?: number }> => spawn(process.execPath, [cliPath, ...args], { cwd })
	.catch((error: SubprocessError) => error);

const extractInlineSourceMap = (
	dts: string,
) => {
	const match = dts.match(/\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,(.+)/);
	if (!match) {
		return null;
	}

	return JSON.parse(Buffer.from(match[1]!, 'base64').toString('utf8')) as {
		file: string;
		mappings: string;
		sources: string[];
		version: number;
	};
};

await describe('CLI', () => {
	const previousMaxListeners = EventEmitter.defaultMaxListeners;
	EventEmitter.defaultMaxListeners = 0;
	onFinish(() => {
		EventEmitter.defaultMaxListeners = previousMaxListeners;
	});

	test('no arguments shows error', async () => {
		await using fixture = await createFixture({});
		const result = await runCli([], fixture.path);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toMatch('Missing required parameter "globs"');
	});

	test('generates .d.ts for single CSS module', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const button: string');
		expect(dts).toMatch('export {');
		expect(dts).toMatch('export default');
	});

	test('generates .d.ts for glob pattern', async () => {
		await using fixture = await createFixture({
			'src/a.module.css': '.alpha { color: red; }',
			'src/nested/b.module.css': '.beta { color: blue; }',
		});

		const result = await runCli(['**/*.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dtsA = await fixture.readFile('src/a.module.css.d.ts', 'utf8');
		expect(dtsA).toMatch('declare const alpha: string');

		const dtsB = await fixture.readFile('src/nested/b.module.css.d.ts', 'utf8');
		expect(dtsB).toMatch('declare const beta: string');
	});

	test('no files matched shows warning on stderr', async () => {
		await using fixture = await createFixture({});
		const result = await runCli(['**/*.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();
		expect(result.stderr).toMatch('No files matched');
	});

	test('CSS parse error sets exit code 1', async () => {
		await using fixture = await createFixture({
			'broken.module.css': '.button { color: ',
		});

		const result = await runCli(['broken.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('broken.module.css');
		expect(result.stderr).toMatch('Unclosed block');
	});

	test('--export-mode named', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['--export-mode', 'named', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('export {');
		expect(dts).not.toMatch('export default');
	});

	test('--export-mode default', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['--export-mode', 'default', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).not.toMatch('export {');
		expect(dts).toMatch('export default');
	});

	test('--locals-convention camelCase', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.my-button { color: red; }',
		});

		const result = await runCli(['--locals-convention', 'camelCase', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('myButton');
		expect(dts).toMatch('"my-button"');
	});

	test('--locals-convention camelCaseOnly', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.my-button { color: red; }',
		});

		const result = await runCli(['--locals-convention', 'camelCaseOnly', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('myButton');
		expect(dts).not.toMatch('my-button');
	});

	test('--locals-convention dashes', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.my-button { color: red; }',
		});

		const result = await runCli(['--locals-convention', 'dashes', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('myButton');
		expect(dts).toMatch('"my-button"');
	});

	test('--locals-convention dashesOnly', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.my-button { color: red; }',
		});

		const result = await runCli(['--locals-convention', 'dashesOnly', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('myButton');
		expect(dts).not.toMatch('my-button');
	});

	test('--arbitrary-exports', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.my-button { color: red; }',
		});

		const result = await runCli(['--arbitrary-exports', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('"my-button"');
	});

	test('invalid --export-mode shows error', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['--export-mode', 'invalid', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('Invalid export mode');
	});

	test('invalid --locals-convention shows error', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['--locals-convention', 'invalid', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('Invalid locals convention');
	});

	test('multiple files with one parse error continues others', async () => {
		await using fixture = await createFixture({
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
		await using fixture = await createFixture({
			'style.module.css': `.base { color: red; }
.button { composes: base; background: blue; }`,
		});

		const result = await runCli(['style.module.css'], fixture.path);
		expect(result.exitCode).toBeUndefined();

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const base: string');
		expect(dts).toMatch('declare const button: string');
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

		test('supports --config-loader bundle for TypeScript vite configs', async () => {
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

			const result = await runCli(
				['--config-loader', 'bundle', 'style.module.css'],
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

		test('CLI --locals-convention overrides vite config localsConvention', async () => {
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

			const result = await runCli(
				['--locals-convention', 'camelCase', 'style.module.css'],
				fixture.path,
			);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('myButton');
			expect(dts).toMatch('"my-button"');
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
				'vite.config.mjs': `export default {
	css: {
		modules: {
			globalModulePaths: [/global\\.module\\.css/],
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

		test('uses patchCssModules exportMode from vite config', async () => {
			const pluginPath = JSON.stringify(path.resolve('dist/index.mjs'));
			await using fixture = await createFixture({
				'style.module.css': '.button { color: red; }',
				'vite.config.mjs': `import { patchCssModules } from ${pluginPath};

export default {
	plugins: [
		patchCssModules({
			exportMode: 'default',
		}),
	],
};`,
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).not.toMatch('export {');
			expect(dts).toMatch('export default');
		});

		test('CLI --export-mode overrides patchCssModules exportMode from vite config', async () => {
			const pluginPath = JSON.stringify(path.resolve('dist/index.mjs'));
			await using fixture = await createFixture({
				'style.module.css': '.button { color: red; }',
				'vite.config.mjs': `import { patchCssModules } from ${pluginPath};

export default {
	plugins: [
		patchCssModules({
			exportMode: 'default',
		}),
	],
};`,
			});

			const result = await runCli(
				['--export-mode', 'named', 'style.module.css'],
				fixture.path,
			);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('export {');
			expect(dts).not.toMatch('export default');
		});

		test('auto-detects declarationMap from tsconfig.json', async () => {
			await using fixture = await createFixture({
				'style.module.css': '.button { color: red; }',
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						declarationMap: true,
					},
				}),
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			const dtsMap = extractInlineSourceMap(dts);

			expect(dtsMap?.version).toBe(3);
			expect(dtsMap?.file).toBe('style.module.css.d.ts');
			expect(dtsMap?.sources).toStrictEqual(['style.module.css']);
			expect(decode(dtsMap!.mappings)[8]).toStrictEqual([[14, 0, 0, 0]]);
		});

		test('uses patchCssModules declarationMap from vite config', async () => {
			const pluginPath = JSON.stringify(path.resolve('dist/index.mjs'));
			await using fixture = await createFixture({
				'style.module.css': '.button { color: red; }',
				'vite.config.mjs': `import { patchCssModules } from ${pluginPath};

export default {
	plugins: [
		patchCssModules({
			declarationMap: true,
		}),
	],
};`,
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('sourceMappingURL=data:application/json;charset=utf-8;base64,');
		});

		test('patchCssModules declarationMap: false overrides tsconfig', async () => {
			const pluginPath = JSON.stringify(path.resolve('dist/index.mjs'));
			await using fixture = await createFixture({
				'style.module.css': '.button { color: red; }',
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						declarationMap: true,
					},
				}),
				'vite.config.mjs': `import { patchCssModules } from ${pluginPath};

export default {
	plugins: [
		patchCssModules({
			declarationMap: false,
		}),
	],
};`,
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).not.toMatch('sourceMappingURL');
		});

		test('supports SCSS line comments', async () => {
			await using fixture = await createFixture({
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
			await using fixture = await createFixture({
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

		test('--no-config bypasses broken vite config', async () => {
			await using fixture = await createFixture({
				'style.module.css': '.button { color: red; }',
				'vite.config.mjs': 'throw new Error("config should not load");',
			});

			const result = await runCli(['--no-config', 'style.module.css'], fixture.path);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
			expect(dts).toMatch('declare const button: string');
		});

		test('supports --cwd for configs that derive paths from process.cwd()', async () => {
			await using fixture = await createFixture({
				'packages/app/tokens.scss': '$brand: red;',
				'packages/app/style.module.scss': `.button {
	color: $brand;
}`,
				'packages/app/vite.config.mjs': `import path from 'node:path';

export default {
	root: process.cwd(),
	css: {
		preprocessorOptions: {
			scss: {
				additionalData: \`@use "\${path.join(process.cwd(), 'tokens.scss')}" as *;\`,
			},
		},
	},
};`,
			});

			const result = await runCli(
				[
					'--config',
					'packages/app/vite.config.mjs',
					'--cwd',
					'packages/app',
					'packages/app/style.module.scss',
				],
				fixture.path,
			);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('packages/app/style.module.scss.d.ts', 'utf8');
			expect(dts).toMatch('declare const button: string');
		});

		test('resolves relative file arguments from --cwd', async () => {
			await using fixture = await createFixture({
				'workspace/packages/app/style.module.scss': '.button { color: red; }',
				'workspace/packages/app/vite.config.mjs': 'export default {};',
			});

			const result = await runCli(
				[
					'--cwd',
					'workspace/packages/app',
					'style.module.scss',
				],
				fixture.path,
			);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('workspace/packages/app/style.module.scss.d.ts', 'utf8');
			expect(dts).toMatch('declare const button: string');
		});

		test('resolves relative --config from --cwd', async () => {
			await using fixture = await createFixture({
				'workspace/packages/app/style.module.scss': '.button { color: red; }',
				'workspace/packages/app/vite.config.mjs': `export default {
	css: {
		modules: {
			localsConvention: 'camelCaseOnly',
		},
	},
};`,
			});

			const result = await runCli(
				[
					'--cwd',
					'workspace/packages/app',
					'--config',
					'vite.config.mjs',
					'style.module.scss',
				],
				fixture.path,
			);
			expect(result.exitCode).toBeUndefined();

			const dts = await fixture.readFile('workspace/packages/app/style.module.scss.d.ts', 'utf8');
			expect(dts).toMatch('declare const button: string');
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
			await using fixture = await createFixture({
				'style.module.css': '.button { composes: base from "./missing.module.css"; }',
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('missing.module.css');
		});

		test('errors on unresolved composes exports', async () => {
			await using fixture = await createFixture({
				'dep.module.css': '.base { color: red; }',
				'style.module.css': '.button { composes: missing from "./dep.module.css"; }',
			});

			const result = await runCli(['style.module.css'], fixture.path);
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toMatch('missing');
			expect(result.stderr).toMatch('dep.module.css');
		});

		test('errors on unresolved @value dependencies', async () => {
			await using fixture = await createFixture({
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
