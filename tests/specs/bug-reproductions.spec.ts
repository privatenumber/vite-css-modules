import { createFixture } from 'fs-fixture';
import { testSuite, expect } from 'manten';
import type { CssSyntaxError } from 'postcss';
import { base64Module } from '../utils/base64-module.js';
import * as fixtures from '../fixtures.js';
import { viteBuild, viteServe } from '../utils/vite.js';

export default testSuite(({ describe }) => {
	describe('bug reproductions', ({ describe }) => {
		describe('postcss (no config)', ({ test }) => {
			test('build', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.multiCssModules);
				onTestFinish(() => fixture.rm());

				const { js, css } = await viteBuild(fixture.path);
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style1: {
						className1: expect.stringMatching(/^_className1_\w+ _util-class_\w+$/),
						default: {
							className1: expect.stringMatching(/^_className1_\w+ _util-class_\w+$/),
							'class-name2': expect.stringMatching(/^_class-name2_\w+ _util-class_\w+ _util-class_\w+$/),
						},
					},
					style2: {
						default: {
							'class-name2': expect.stringMatching(/^_class-name2_\w+ _util-class_\w+$/),
						},
					},
				});

				expect(css).toMatch('--file: "style1.module.css"');
				expect(css).toMatch('--file: "style2.module.css"');

				// Without the patch, PostCSS is not applied to composed dependencies
				// https://github.com/vitejs/vite/issues/10079
				expect(css).not.toMatch('--file: "utils1.css?.module.css"');
				expect(css).not.toMatch('--file: "utils2.css?.module.css"');

				// util class is duplicated
				// https://github.com/vitejs/vite/issues/15683
				const utilClass = Array.from(css!.matchAll(/util-class/g));
				expect(utilClass.length).toBeGreaterThan(1);
			});

			test('inline', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.inlineCssModules);
				onTestFinish(() => fixture.rm());

				const { js } = await viteBuild(fixture.path);
				const exported = await import(base64Module(js));

				expect(typeof exported.default).toBe('string');
				expect(exported.default).toMatch('--file: "style.module.css?inline"');
			});

			test('dev server', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.multiCssModules);
				onTestFinish(() => fixture.rm());

				const code = await viteServe(fixture.path);

				expect(code).toMatch('--file: \\"style1.module.css\\"');
				expect(code).toMatch('--file: \\"style2.module.css\\"');

				// Without the patch, PostCSS is not applied to composed dependencies
				expect(code).not.toMatch('--file: "utils1.css?.module.css"');
				expect(code).not.toMatch('--file: "utils2.css?.module.css"');

				// util class is duplicated
				// https://github.com/vitejs/vite/issues/15683
				const utilClass = Array.from(code.matchAll(/util-class/g));
				expect(utilClass.length).toBeGreaterThan(1);
			});

			// https://github.com/vitejs/vite/issues/10340
			test('mixed css + scss types doesnt build', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.mixedScssModules);
				onTestFinish(() => fixture.rm());

				let error: CssSyntaxError | undefined;
				process.once('unhandledRejection', (reason) => {
					error = reason as CssSyntaxError;
				});
				try {
					await viteBuild(fixture.path, {
						logLevel: 'silent',
					});
				} catch {}

				expect(error?.reason).toBe('Unexpected \'/\'. Escaping special characters with \\ may help.');
			});

			// This one is more for understanding expected behavior
			test('@values', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.cssModulesValues);
				onTestFinish(() => fixture.rm());

				const { js, css } = await viteBuild(fixture.path);
				const exported = await import(base64Module(js));

				expect(exported).toMatchObject({
					default: {
						'class-name1': '_class-name1_1220u_4 _util-class_irvot_4 _util-class_2pvet_3',
						'class-name2': '_class-name2_1220u_10',

						// @values
						p1: '#fff',
						'simple-border': '1px solid black',
						p2: '#000',
					},

					// @values
					p1: '#fff',
					p2: '#000',
				});

				// Without the patch, PostCSS is not applied to composed dependencies
				expect(css).not.toMatch('--file: "utils1.css?.module.css"');

				expect(css).toMatch('border: 1px solid black');
			});

			test('globalModulePaths', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.globalModule);
				onTestFinish(() => fixture.rm());

				const { js, css } = await viteBuild(fixture.path, {
					css: {
						modules: {
							globalModulePaths: [/global\.module\.css/],
						},
					},
				});

				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					default: {
						title: expect.stringMatching(/^_title_\w{5}/),
					},
					title: expect.stringMatching(/^_title_\w{5}/),
				});

				expect(css).toMatch('.page {');
			});
		});

		describe('LightningCSS', ({ describe, test }) => {
			describe('no config', ({ test }) => {
				test('build', async ({ onTestFinish }) => {
					const fixture = await createFixture(fixtures.multiCssModules);
					onTestFinish(() => fixture.rm());

					const { js, css } = await viteBuild(fixture.path, {
						css: {
							transformer: 'lightningcss',
						},
					});

					const exported = await import(base64Module(js));
					expect(exported).toMatchObject({
						style1: {
							className1: expect.stringMatching(/^[\w-]+_className1 [\w-]+_util-class$/),
							default: {
								className1: expect.stringMatching(/^[\w-]+_className1 [\w-]+_util-class$/),
								'class-name2': expect.stringMatching(/^[\w-]+_class-name2 [\w-]+_util-class [\w-]+_util-class$/),
							},
						},
						style2: {
							default: {
								'class-name2': expect.stringMatching(/^[\w-]+_class-name2 [\w-]+_util-class$/),
							},
						},
					});

					// util class is duplicated
					// https://github.com/vitejs/vite/issues/15683
					const utilClass = Array.from(css!.matchAll(/util-class/g));
					expect(utilClass.length).toBeGreaterThan(1);
				});

				test('dev server', async ({ onTestFinish }) => {
					const fixture = await createFixture(fixtures.multiCssModules);
					onTestFinish(() => fixture.rm());

					const code = await viteServe(fixture.path, {
						css: {
							transformer: 'lightningcss',
						},
					});

					// util class is duplicated
					// https://github.com/vitejs/vite/issues/15683
					const utilClass = Array.from(code.matchAll(/util-class/g));
					expect(utilClass.length).toBeGreaterThan(1);
				});
			});

			test('dashedIdents', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.lightningCustomPropertiesFrom);
				onTestFinish(() => fixture.rm());

				const { css } = await viteBuild(fixture.path, {
					css: {
						transformer: 'lightningcss',
						lightningcss: {
							cssModules: {
								dashedIdents: true,
							},
						},
					},
				});

				// util custom property is duplicated
				// https://github.com/vitejs/vite/issues/15683
				const utilClass = Array.from(css!.matchAll(/hotpink/g));
				expect(utilClass.length).toBeGreaterThan(1);
			});
		});
	});
});
