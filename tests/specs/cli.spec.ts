import path from 'node:path';
import { execaNode, type Result } from 'execa';
import { testSuite, expect } from 'manten';
import { createFixture, type FileTree } from 'fs-fixture';
import outdent from 'outdent';

const cliPath = path.resolve('dist/cli/index.mjs');

const installDependencies: FileTree = {
	node_modules: {
		vite: ({ symlink }) => symlink(path.resolve('node_modules/vite'), 'dir'),
		'vite-css-modules': ({ symlink }) => symlink(path.resolve('.'), 'dir'),
	},
};

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

// Helper functions for creating common configs
const createPostCSSConfig = (pluginOptions: Record<string, unknown> = {}) => outdent`
	import { defineConfig } from 'vite';
	import { patchCssModules } from 'vite-css-modules';

	export default defineConfig({
		plugins: [
			patchCssModules(${JSON.stringify({
	generateSourceTypes: true,
	...pluginOptions,
})})
		]
	});
`;

const createPostCSSConfigWithModules = (
	modulesOptions: Record<string, unknown>,
	pluginOptions: Record<string, unknown> = {},
) => outdent`
	import { defineConfig } from 'vite';
	import { patchCssModules } from 'vite-css-modules';

	export default defineConfig({
		css: {
			modules: ${JSON.stringify(modulesOptions)},
		},
		plugins: [
			patchCssModules(${JSON.stringify({
	generateSourceTypes: true,
	...pluginOptions,
})})
		]
	});
`;

const createLightningCSSConfig = (pluginOptions: Record<string, unknown> = {}) => outdent`
	import { defineConfig } from 'vite';
	import { patchCssModules } from 'vite-css-modules';

	export default defineConfig({
		css: {
			transformer: 'lightningcss',
		},
		plugins: [
			patchCssModules(${JSON.stringify({
	generateSourceTypes: true,
	...pluginOptions,
})})
		]
	});
`;

export default testSuite(({ describe }) => {
	describe('CLI', ({ describe }) => {
		describe('error cases', ({ test }) => {
			test('fails when no command is specified', async () => {
				await using fixture = await createFixture({
					'vite.config.ts': createPostCSSConfig(),
					'style.module.css': '.button { color: red; }',
					...installDependencies,
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

			test('fails when config is missing', async () => {
				await using fixture = await createFixture({
					'style.module.css': '.button { color: red; }',
				});

				const { exitCode, stderr } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(1);
				expect(stderr).toMatch(/Failed to load Vite config/);
				expect(stderr).toMatch(/No Vite config found/);
			});

			test('fails when plugin is not configured', async () => {
				await using fixture = await createFixture({
					'vite.config.ts': outdent`
						import { defineConfig } from 'vite';
						export default defineConfig({
							plugins: []
						});
					`,
					'style.module.css': '.button { color: red; }',
					...installDependencies,
				});

				const { exitCode, stderr } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(1);
				expect(stderr).toMatch(/Failed to load Vite config/);
				expect(stderr).toMatch(/Failed to capture vite-css-modules config/);
			});

			test('fails when generateSourceTypes is disabled', async () => {
				await using fixture = await createFixture({
					'vite.config.ts': createPostCSSConfig({ generateSourceTypes: false }),
					'style.module.css': '.button { color: red; }',
					...installDependencies,
				});

				const { exitCode, stderr } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(1);
				expect(stderr).toMatch(/Failed to load Vite config/);
				expect(stderr).toMatch(/generateSourceTypes must be enabled/);
			});

			test('fails when CSS Modules is disabled', async () => {
				await using fixture = await createFixture({
					'vite.config.ts': outdent`
						import { defineConfig } from 'vite';
						import { patchCssModules } from 'vite-css-modules';

						export default defineConfig({
							css: {
								modules: false,
							},
							plugins: [
								patchCssModules({ generateSourceTypes: true })
							]
						});
					`,
					'style.module.css': '.button { color: red; }',
					...installDependencies,
				});

				const { exitCode, stderr } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(1);
				expect(stderr).toMatch(/Failed to load Vite config/);
				expect(stderr).toMatch(/CSS Modules is disabled/);
			});

			test('ignores common directories like node_modules', async () => {
				await using fixture = await createFixture({
					'vite.config.ts': createPostCSSConfig(),
					'src/style.module.css': '.button { color: red; }',
					'node_modules/package/style.module.css': '.ignored { color: blue; }',
					'dist/style.module.css': '.ignored { color: green; }',
					'build/style.module.css': '.ignored { color: yellow; }',
					...installDependencies,
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
					'vite.config.ts': createPostCSSConfig(),
					'broken.module.css': '.button { color: red',
					...installDependencies,
				});

				const { exitCode, stderr } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(1);
				expect(stderr).toMatch(/Failed to generate types/);
			});
		});

		describe('config file formats', ({ test }) => {
			const configFormats = [
				'vite.config.js',
				'vite.config.mjs',
				'vite.config.ts',
				'vite.config.mts',
			];

			for (const configName of configFormats) {
				test(`supports ${configName}`, async () => {
					await using fixture = await createFixture({
						[configName]: createPostCSSConfig(),
						'style.module.css': '.button { color: red; }',
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);
					expect(exitCode).toBe(0);
				});
			}
		});

		describe('basic functionality', ({ test }) => {
			test('succeeds when no CSS modules found', async () => {
				await using fixture = await createFixture({
					'vite.config.ts': createPostCSSConfig(),
					'style.css': '.button { color: red; }',
					...installDependencies,
				});

				const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/No CSS Modules found/);
			});

			test('supports monorepo with multiple vite configs', async ({ onTestFail }) => {
				await using fixture = await createFixture({
					packages: {
						'package-a': {
							'vite.config.ts': createPostCSSConfig({ exportMode: 'named' }),
							'style.module.css': '.button { color: red; }',
						},
						'package-b': {
							'vite.config.ts': createPostCSSConfig({ exportMode: 'default' }),
							'style.module.css': '.card { padding: 10px; }',
						},
					},
					...installDependencies,
				});

				const { exitCode, stdout, stderr } = await viteCssModulesCli([], fixture.path);

				onTestFail(() => {
					console.log('stdout:', stdout);
					console.log('stderr:', stderr);
				});

				expect(exitCode).toBe(0);
				expect(stdout).toMatch(/Found 2 CSS Module/);
				expect(stdout).toMatch(/packages\/package-a\/style\.module\.css\.d\.ts/);
				expect(stdout).toMatch(/packages\/package-b\/style\.module\.css\.d\.ts/);

				const packageADts = await fixture.readFile('packages/package-a/style.module.css.d.ts', 'utf8');
				expect(packageADts).toContain('export {\n\tbutton\n}');
				expect(packageADts).not.toContain('export default');

				const packageBDts = await fixture.readFile('packages/package-b/style.module.css.d.ts', 'utf8');
				expect(packageBDts).toContain('export default __default_export__');
				expect(packageBDts).not.toContain('export {\n\tcard\n}');
			});

			test('generates types for multiple subdirectories with config in root', async () => {
				await using fixture = await createFixture({
					'vite.config.ts': createPostCSSConfig(),
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
					...installDependencies,
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
		});

		describe('PostCSS', ({ describe }) => {
			describe('basic features', ({ test }) => {
				test('generates types for CSS module in current directory', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig({ exportMode: 'both' }),
						'style.module.css': outdent`
							.button {
								color: red;
							}
							.header {
								font-size: 20px;
							}
						`,
						...installDependencies,
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
						'vite.config.ts': createPostCSSConfig(),
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
						...installDependencies,
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
						'vite.config.ts': createPostCSSConfig(),
						'button.module.css': '.primary { color: blue; }',
						'card.module.css': '.container { padding: 10px; }',
						'header.module.css': '.title { font-size: 24px; }',
						...installDependencies,
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

			describe('CSS preprocessors', ({ test }) => {
				test('generates types for .pcss files', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig(),
						'style.module.pcss': outdent`
							.container {
								color: #333;

								.nested {
									background: #999;
								}
							}
						`,
						...installDependencies,
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
						'vite.config.ts': createPostCSSConfig(),
						'style.module.postcss': '.button { color: red; }',
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);
					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.postcss.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
				});

				test('generates types for .scss files', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig(),
						'style.module.scss': '.button { color: red; }',
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);
					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.scss.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
				});

				test('generates types for .sass files', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig(),
						'style.module.sass': '.button { color: red; }',
						...installDependencies,
						node_modules: {
							...(installDependencies.node_modules as Record<string, unknown>),
							sass: ({ symlink }) => symlink(path.resolve('node_modules/sass'), 'dir'),
						},
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);
					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.sass.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
				});

				test('generates types for .less files', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig(),
						'style.module.less': '.button { color: red; }',
						...installDependencies,
						node_modules: {
							...(installDependencies.node_modules as Record<string, unknown>),
							less: ({ symlink }) => symlink(path.resolve('node_modules/less'), 'dir'),
						},
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);
					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.less.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
				});

				test('generates types for .styl files', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig(),
						'style.module.styl': '.button { color: red; }',
						...installDependencies,
						node_modules: {
							...(installDependencies.node_modules as Record<string, unknown>),
							stylus: ({ symlink }) => symlink(path.resolve('node_modules/stylus'), 'dir'),
						},
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);
					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.styl.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
				});

				test('generates types for .stylus files', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig(),
						'style.module.stylus': '.button { color: red; }',
						...installDependencies,
						node_modules: {
							...(installDependencies.node_modules as Record<string, unknown>),
							stylus: ({ symlink }) => symlink(path.resolve('node_modules/stylus'), 'dir'),
						},
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
						'vite.config.ts': createPostCSSConfig(),
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
						...installDependencies,
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

			describe('export modes', ({ test }) => {
				test('generates types with exportMode: named', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig({ exportMode: 'named' }),
						'style.module.css': '.button { color: red; }',
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
					expect(dtsContent).toContain('export {\n\tbutton\n}');
					expect(dtsContent).not.toContain('export default');
				});

				test('generates types with exportMode: default', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig({ exportMode: 'default' }),
						'style.module.css': '.button { color: red; }',
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
					expect(dtsContent).toContain('export default __default_export__');
					expect(dtsContent).not.toMatch(/export \{ button/);
				});

				test('generates types with exportMode: both (default)', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig({ exportMode: 'both' }),
						'style.module.css': '.button { color: red; }',
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
					expect(dtsContent).toContain('export {\n\tbutton\n}');
					expect(dtsContent).toContain('export default __default_export__');
				});
			});

			describe('dashed names', ({ test }) => {
				test('converts dashed names to valid identifiers without localsConvention', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfig(),
						'style.module.css': outdent`
							.camel-case {
								color: blue;
							}
							.another-dashed-name {
								font-size: 20px;
							}
						`,
						...installDependencies,
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

			describe('localsConvention', ({ test }) => {
				test('generates types with localsConvention: camelCase', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfigWithModules({
							localsConvention: 'camelCase',
						}),
						'style.module.css': outdent`
							.my-button {
								color: blue;
							}
							.apply-color {
								background: red;
							}
						`,
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const myButton: string');
					expect(dtsContent).toContain('declare const applyColor: string');
					expect(dtsContent).toContain('"my-button": typeof myButton');
					expect(dtsContent).toContain('"apply-color": typeof applyColor');
				});

				test('generates types with localsConvention: camelCaseOnly', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfigWithModules({
							localsConvention: 'camelCaseOnly',
						}),
						'style.module.css': outdent`
							.my-button {
								color: blue;
							}
							.apply-color {
								background: red;
							}
						`,
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const myButton: string');
					expect(dtsContent).toContain('declare const applyColor: string');
					expect(dtsContent).toContain('myButton');
					expect(dtsContent).toContain('applyColor');
				});

				test('generates types with localsConvention: dashes', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfigWithModules({
							localsConvention: 'dashes',
						}),
						'style.module.css': outdent`
							.my-button {
								color: blue;
							}
							.apply-color {
								background: red;
							}
						`,
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const myButton: string');
					expect(dtsContent).toContain('declare const applyColor: string');
					expect(dtsContent).toContain('"my-button": typeof myButton');
					expect(dtsContent).toContain('"apply-color": typeof applyColor');
				});

				test('generates types with localsConvention: dashesOnly', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createPostCSSConfigWithModules({
							localsConvention: 'dashesOnly',
						}),
						'style.module.css': outdent`
							.my-button {
								color: blue;
							}
							.apply-color {
								background: red;
							}
						`,
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const myButton: string');
					expect(dtsContent).toContain('declare const applyColor: string');
					expect(dtsContent).toContain('myButton');
					expect(dtsContent).toContain('applyColor');
				});
			});
		});

		describe('LightningCSS', ({ describe }) => {
			describe('basic features', ({ test }) => {
				test('generates types for CSS module', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createLightningCSSConfig(),
						'style.module.css': outdent`
							.button {
								color: red;
							}
							.header {
								font-size: 20px;
							}
						`,
						...installDependencies,
					});

					const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);
					expect(stdout).toMatch(/✓.*style\.module\.css\.d\.ts/);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
					expect(dtsContent).toContain('declare const header: string');
					expect(dtsContent).toContain('export {\n\tbutton,\n\theader\n}');
				});

				test('generates types for multiple CSS modules', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createLightningCSSConfig(),
						'button.module.css': '.primary { color: blue; }',
						'card.module.css': '.container { padding: 10px; }',
						...installDependencies,
					});

					const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);
					expect(stdout).toMatch(/Successfully generated types for 2 CSS Module/);

					const buttonDts = await fixture.readFile('button.module.css.d.ts', 'utf8');
					expect(buttonDts).toContain('declare const primary: string');

					const cardDts = await fixture.readFile('card.module.css.d.ts', 'utf8');
					expect(cardDts).toContain('declare const container: string');
				});
			});

			describe('dashed names', ({ test }) => {
				test('matches PostCSS behavior for dashed names', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createLightningCSSConfig(),
						'style.module.css': outdent`
							.camel-case {
								color: blue;
							}
							.another-dashed-name {
								font-size: 20px;
							}
						`,
						...installDependencies,
					});

					const { exitCode, stdout } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);
					expect(stdout).toMatch(/✓.*style\.module\.css\.d\.ts/);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					// LightningCSS exports should match PostCSS behavior:
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

			describe('export modes', ({ test }) => {
				test('generates types with exportMode: named', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createLightningCSSConfig({ exportMode: 'named' }),
						'style.module.css': '.button { color: red; }',
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
					expect(dtsContent).toContain('export {\n\tbutton\n}');
					expect(dtsContent).not.toContain('export default');
				});

				test('generates types with exportMode: default', async () => {
					await using fixture = await createFixture({
						'vite.config.ts': createLightningCSSConfig({ exportMode: 'default' }),
						'style.module.css': '.button { color: red; }',
						...installDependencies,
					});

					const { exitCode } = await viteCssModulesCli([], fixture.path);

					expect(exitCode).toBe(0);

					const dtsContent = await fixture.readFile('style.module.css.d.ts', 'utf8');
					expect(dtsContent).toContain('declare const button: string');
					expect(dtsContent).toContain('export default __default_export__');
					expect(dtsContent).not.toMatch(/export \{ button/);
				});
			});
		});
	});
});
