import path from 'node:path';
import { execaNode, type Result } from 'execa';
import { testSuite, expect } from 'manten';
import { createFixture } from 'fs-fixture';
import outdent from 'outdent';

const cliPath = path.resolve('dist/cli/index.mjs');

const viteCssModulesCli = async (
	args: string[],
	cwd: string,
): Promise<Result> => execaNode(
	cliPath,
	['generate-types', ...args],
	{
		cwd,
		reject: false,
	},
);

export default testSuite(({ describe }) => {
	describe('CLI', ({ describe }) => {
		describe('error cases', ({ test }) => {
			test('fails when no command is specified', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.button { color: red; }',
				});

				const { exitCode, stderr } = await execaNode(
					cliPath,
					[],
					{
						cwd: fixture.path,
						reject: false,
					},
				);

				expect(exitCode).toBe(1);
				expect(stderr).toMatch(/No command specified/);
			});

			test('fails with invalid --export-mode', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.button { color: red; }',
				});

				const { exitCode, stderr } = await viteCssModulesCli(
					['--export-mode', 'invalid'],
					fixture.path,
				);

				expect(exitCode).toBe(1);
				expect(stderr).toMatch(/Invalid --export-mode/);
			});

			test('fails with invalid --locals-convention', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.button { color: red; }',
				});

				const { exitCode, stderr } = await viteCssModulesCli(
					['--locals-convention', 'invalid'],
					fixture.path,
				);

				expect(exitCode).toBe(1);
				expect(stderr).toMatch(/Invalid --locals-convention/);
			});

			test('ignores common directories like node_modules', async () => {
				await using fixture = await createFixture({
					'src/style.module.css': '.button { color: red; }',
					'node_modules/package/style.module.css': '.ignored { color: blue; }',
					'dist/style.module.css': '.ignored { color: green; }',
					'build/style.module.css': '.ignored { color: yellow; }',
				});

				const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/Found 1 CSS Module/);
				expect(stdout).toMatch(/src\/style\.module\.css\.d\.ts/);
				expect(stdout).not.toMatch(/node_modules/);
				expect(stdout).not.toMatch(/dist/);
				expect(stdout).not.toMatch(/build/);
			});

			test('handles CSS syntax errors gracefully', async () => {
				await using fixture = await createFixture({
					'broken.module.css': '.button { color: red',
				});

				const { exitCode, stderr } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(1);
				expect(stderr).toMatch(/Failed to generate types/);
			});
		});

		describe('basic functionality', ({ test }) => {
			test('succeeds when no CSS modules found', async () => {
				await using fixture = await createFixture({
					'style.css': '.button { color: red; }',
				});

				const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/No CSS Modules found/);
			});

			test('generates types for multiple subdirectories', async () => {
				await using fixture = await createFixture({
					src: {
						'components/button.module.css': outdent`
							.primary {
								background: blue;
							}
						`,
						'utils/layout.module.css': outdent`
							.container {
								display: flex;
							}
						`,
					},
				});

				const { exitCode, stdout } = await viteCssModulesCli(
					['./src/components', './src/utils'],
					fixture.path,
				);

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/Successfully generated types for 2 CSS Module/);

				const buttonDts = await fixture.readFile('src/components/button.module.css.d.ts', 'utf8');
				expect(buttonDts).toContain('declare const primary: string');

				const layoutDts = await fixture.readFile('src/utils/layout.module.css.d.ts', 'utf8');
				expect(layoutDts).toContain('declare const container: string');
			});

			test('generates types for CSS module in current directory', async () => {
				await using fixture = await createFixture({
					'style.module.css': outdent`
						.button {
							color: red;
						}
						.header {
							font-size: 20px;
						}
					`,
				});

				const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/✓.*style\.module\.css\.d\.ts/);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const button: string');
				expect(dtsContent).toContain('declare const header: string');
				expect(dtsContent).toContain('export {\n\tbutton,\n\theader\n}');
				expect(dtsContent).toContain('export default __default_export__');
			});

			test('generates types for nested CSS modules', async () => {
				await using fixture = await createFixture({
					'src/components.module.css': outdent`
						.card {
							border: 1px solid black;
						}
					`,
					'src/utils/helpers.module.css': outdent`
						.utility {
							display: flex;
						}
					`,
				});

				const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/Successfully generated types for 2 CSS Module/);

				const componentsDts = await fixture.readFile('src/components.module.css.d.ts', 'utf8');
				expect(componentsDts).toContain('declare const card: string');

				const helpersDts = await fixture.readFile('src/utils/helpers.module.css.d.ts', 'utf8');
				expect(helpersDts).toContain('declare const utility: string');
			});

			test('generates types for multiple CSS modules', async () => {
				await using fixture = await createFixture({
					'button.module.css': '.primary { color: blue; }',
					'card.module.css': '.container { padding: 10px; }',
					'header.module.css': '.title { font-size: 24px; }',
				});

				const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/Successfully generated types for 3 CSS Module/);

				const buttonDts = await fixture.readFile('button.module.css.d.ts', 'utf8');
				expect(buttonDts).toContain('declare const primary: string');

				const cardDts = await fixture.readFile('card.module.css.d.ts', 'utf8');
				expect(cardDts).toContain('declare const container: string');

				const headerDts = await fixture.readFile('header.module.css.d.ts', 'utf8');
				expect(headerDts).toContain('declare const title: string');
			});
		});

		describe('file extensions', ({ test }) => {
			test('generates types for .pcss files', async () => {
				await using fixture = await createFixture({
					'style.module.pcss': outdent`
						.container {
							color: #333;

							.nested {
								background: #999;
							}
						}
					`,
				});

				const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/✓.*style\.module\.pcss\.d\.ts/);

				const dtsContent = await fixture.readFile('style.module.pcss.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const container: string');
				expect(dtsContent).toContain('declare const nested: string');
			});

			test('generates types for .postcss files', async () => {
				await using fixture = await createFixture({
					'style.module.postcss': '.button { color: red; }',
				});

				const { exitCode } = await viteCssModulesCli([], fixture.path);
				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.postcss.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const button: string');
			});

			test('generates types for .scss files (plain CSS syntax only)', async () => {
				await using fixture = await createFixture({
					'style.module.scss': '.button { color: red; }',
				});

				const { exitCode } = await viteCssModulesCli([], fixture.path);
				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.scss.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const button: string');
			});

			test('generates types for .sass files (plain CSS syntax only)', async () => {
				await using fixture = await createFixture({
					'style.module.sass': '.button { color: red; }',
				});

				const { exitCode } = await viteCssModulesCli([], fixture.path);
				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.sass.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const button: string');
			});

			test('generates types for .less files (plain CSS syntax only)', async () => {
				await using fixture = await createFixture({
					'style.module.less': '.button { color: red; }',
				});

				const { exitCode } = await viteCssModulesCli([], fixture.path);
				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.less.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const button: string');
			});

			test('generates types for .styl files (plain CSS syntax only)', async () => {
				await using fixture = await createFixture({
					'style.module.styl': '.button { color: red; }',
				});

				const { exitCode } = await viteCssModulesCli([], fixture.path);
				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.styl.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const button: string');
			});

			test('generates types for .stylus files (plain CSS syntax only)', async () => {
				await using fixture = await createFixture({
					'style.module.stylus': '.button { color: red; }',
				});

				const { exitCode } = await viteCssModulesCli([], fixture.path);
				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.stylus.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const button: string');
			});
		});

		describe('composes', ({ test }) => {
			test('generates types for CSS modules with composes', async () => {
				await using fixture = await createFixture({
					'base.module.css': outdent`
						.reset {
							margin: 0;
							padding: 0;
						}
						.base {
							font-family: sans-serif;
						}
					`,
					'button.module.css': outdent`
						.primary {
							composes: reset base from './base.module.css';
							color: blue;
						}
						.secondary {
							composes: reset from './base.module.css';
							color: gray;
						}
					`,
				});

				const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/Successfully generated types for 2 CSS Module/);

				const baseDts = await fixture.readFile('base.module.css.d.ts', 'utf8');
				expect(baseDts).toContain('declare const reset: string');
				expect(baseDts).toContain('declare const base: string');

				const buttonDts = await fixture.readFile('button.module.css.d.ts', 'utf8');
				expect(buttonDts).toContain('declare const primary: string');
				expect(buttonDts).toContain('declare const secondary: string');
			});
		});

		describe('--export-mode', ({ test }) => {
			test('generates types with --export-mode named', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.button { color: red; }',
				});

				const { exitCode } = await viteCssModulesCli(
					['--export-mode', 'named'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const button: string');
				expect(dtsContent).toContain('export {\n\tbutton\n}');
				expect(dtsContent).not.toContain('export default');
			});

			test('generates types with --export-mode default', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.button { color: red; }',
				});

				const { exitCode } = await viteCssModulesCli(
					['--export-mode', 'default'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const button: string');
				expect(dtsContent).toContain('export default __default_export__');
				expect(dtsContent).not.toMatch(/export \{ button/);
			});

			test('generates types with --export-mode both (default)', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.button { color: red; }',
				});

				const { exitCode } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const button: string');
				expect(dtsContent).toContain('export {\n\tbutton\n}');
				expect(dtsContent).toContain('export default __default_export__');
			});

			test('supports -e alias for --export-mode', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.button { color: red; }',
				});

				const { exitCode } = await viteCssModulesCli(
					['-e', 'named'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).not.toContain('export default');
			});
		});

		describe('dashed names', ({ test }) => {
			test('converts dashed names to valid identifiers without --locals-convention', async () => {
				await using fixture = await createFixture({
					'style.module.css': outdent`
						.camel-case {
							color: blue;
						}
						.another-dashed-name {
							font-size: 20px;
						}
					`,
				});

				const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/✓.*style\.module\.css\.d\.ts/);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				// Without localsConvention, dashed names are converted to valid identifiers
				// - JavaScript variables must use valid identifiers (camelCase)
				// - Default export preserves original dashed names as quoted keys
				expect(dtsContent).toContain('declare const camelCase: string');
				expect(dtsContent).toContain('declare const anotherDashedName: string');
				expect(dtsContent).toContain('"camel-case": typeof camelCase');
				expect(dtsContent).toContain('"another-dashed-name": typeof anotherDashedName');
				// Should NOT have additional camelCase exports in default
				// (would indicate localsConvention transformation)
				expect(dtsContent).not.toContain('"camelCase"');
				expect(dtsContent).not.toContain('"anotherDashedName"');
			});
		});

		describe('--locals-convention', ({ test }) => {
			test('generates types with --locals-convention camelCase', async () => {
				await using fixture = await createFixture({
					'style.module.css': outdent`
						.my-button {
							color: blue;
						}
						.apply-color {
							background: red;
						}
					`,
				});

				const { exitCode } = await viteCssModulesCli(
					['--locals-convention', 'camelCase'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const myButton: string');
				expect(dtsContent).toContain('declare const applyColor: string');
				expect(dtsContent).toContain('"my-button": typeof myButton');
				expect(dtsContent).toContain('"apply-color": typeof applyColor');
			});

			test('generates types with --locals-convention camelCaseOnly', async () => {
				await using fixture = await createFixture({
					'style.module.css': outdent`
						.my-button {
							color: blue;
						}
						.apply-color {
							background: red;
						}
					`,
				});

				const { exitCode } = await viteCssModulesCli(
					['--locals-convention', 'camelCaseOnly'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const myButton: string');
				expect(dtsContent).toContain('declare const applyColor: string');
				// camelCaseOnly should NOT have the original dashed names
				expect(dtsContent).not.toContain('"my-button"');
				expect(dtsContent).not.toContain('"apply-color"');
			});

			test('generates types with --locals-convention dashes', async () => {
				await using fixture = await createFixture({
					'style.module.css': outdent`
						.my-button {
							color: blue;
						}
						.apply-color {
							background: red;
						}
					`,
				});

				const { exitCode } = await viteCssModulesCli(
					['--locals-convention', 'dashes'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const myButton: string');
				expect(dtsContent).toContain('declare const applyColor: string');
				expect(dtsContent).toContain('"my-button": typeof myButton');
				expect(dtsContent).toContain('"apply-color": typeof applyColor');
			});

			test('generates types with --locals-convention dashesOnly', async () => {
				await using fixture = await createFixture({
					'style.module.css': outdent`
						.my-button {
							color: blue;
						}
						.apply-color {
							background: red;
						}
					`,
				});

				const { exitCode } = await viteCssModulesCli(
					['--locals-convention', 'dashesOnly'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const myButton: string');
				expect(dtsContent).toContain('declare const applyColor: string');
				// dashesOnly should NOT have the original dashed names
				expect(dtsContent).not.toContain('"my-button"');
				expect(dtsContent).not.toContain('"apply-color"');
			});

			test('supports -l alias for --locals-convention', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.my-button { color: blue; }',
				});

				const { exitCode } = await viteCssModulesCli(
					['-l', 'camelCase'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('declare const myButton: string');
			});
		});

		describe('--target', ({ test }) => {
			test('generates types with --target es2022 (allows arbitrary named exports)', async () => {
				await using fixture = await createFixture({
					'style.module.css': outdent`
						.foo-bar {
							color: blue;
						}
					`,
				});

				const { exitCode } = await viteCssModulesCli(
					['--target', 'es2022'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				// With ES2022+, dashed names can be exported directly as string literals
				expect(dtsContent).toContain('fooBar as "foo-bar"');
			});

			test('generates types with --target esnext', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.foo-bar { color: blue; }',
				});

				const { exitCode } = await viteCssModulesCli(
					['--target', 'esnext'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('fooBar as "foo-bar"');
			});

			test('generates types with --target chrome90', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.foo-bar { color: blue; }',
				});

				const { exitCode } = await viteCssModulesCli(
					['--target', 'chrome90'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dtsContent).toContain('fooBar as "foo-bar"');
			});

			test('does not allow arbitrary exports without supported target', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.foo-bar { color: blue; }',
				});

				const { exitCode } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				// Without target, dashed names should NOT have arbitrary export syntax
				expect(dtsContent).not.toContain('as "foo-bar"');
				// But should still have the quoted key in default export
				expect(dtsContent).toContain('"foo-bar": typeof fooBar');
			});

			test('does not allow arbitrary exports with older target', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.foo-bar { color: blue; }',
				});

				const { exitCode } = await viteCssModulesCli(
					['--target', 'es2020'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				// ES2020 doesn't support arbitrary module namespace names
				expect(dtsContent).not.toContain('as "foo-bar"');
			});
		});

		describe('combined flags', ({ test }) => {
			test('works with multiple flags combined', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.my-button { color: blue; }',
				});

				const { exitCode } = await viteCssModulesCli(
					['-e', 'named', '-l', 'camelCase', '--target', 'es2022'],
					fixture.path,
				);

				expect(exitCode).toBe(0);

				const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
				// Named export mode
				expect(dtsContent).not.toContain('export default');
				// camelCase convention with original preserved
				expect(dtsContent).toContain('declare const myButton: string');
				// ES2022 arbitrary exports
				expect(dtsContent).toContain('myButton as "my-button"');
			});
		});
	});
});
