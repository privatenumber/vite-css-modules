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
						'class-name1': '_class-name1_1g59v_1 _util-class_iayaa_1',
					},
					style2: {
						'class-name2': '_class-name2_3uf60_1 _util-class_iayaa_1',
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
		});

		describe('LightningCSS', ({ test }) => {
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
					expect(exported.style1['class-name1']).toMatch(/^[\w-]+_class-name1\s+[\w-]+_util-class$/);
					expect(exported.style2['class-name2']).toMatch(/^[\w-]+_class-name2\s+[\w-]+_util-class$/);

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
