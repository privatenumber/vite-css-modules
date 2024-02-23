import { createFixture } from 'fs-fixture';
import { testSuite, expect } from 'manten';
import { base64Module } from '../../utils/base64-module.js';
import * as fixtures from '../../fixtures.js';
import { viteBuild, viteServe } from '../../utils/vite.js';
import { patchCssModules } from '#vite-css-modules';

export default testSuite(({ describe }) => {
	describe('PostCSS', ({ test, describe }) => {
		describe('no config', ({ test }) => {
			test('build', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.multiCssModules);
				onTestFinish(() => fixture.rm());

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
				});

				expect(css).toMatch('--file: "style1.module.css"');
				expect(css).toMatch('--file: "style2.module.css"');

				// Ensure that PostCSS is applied to the composed
				expect(css).toMatch('--file: "utils1.css?.module.css"');
				expect(css).toMatch('--file: "utils2.css?.module.css"');

				// Util is not duplicated despite being used twice
				const utilClass = Array.from(css!.matchAll(/foo/g));
				expect(utilClass.length).toBe(1);

				const exported = await import(base64Module(js));

				const classes = [
					...exported.style1['class-name1'].split(' '),
					...exported.style1['class-name2'].split(' '),
					...exported.style2['class-name2'].split(' '),
				];

				for (const className of classes) {
					expect(className).toMatch(/^[-\w][-\dA-Z]*_[-\w]+_\w{5}$/i);
					expect(css).toMatch(`.${className}`);
				}
			});

			test('scss', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.scssModules);
				onTestFinish(() => fixture.rm());

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
				});

				expect(css).toMatch('--file: "style.module.scss"');

				const exported = await import(base64Module(js));
				expect(exported['text-primary']).toMatch(/^[-\w][-\dA-Z]*_[-\w]+_\w{5}$/i);

				const className = exported['text-primary'];
				expect(css).toMatch(`.${className}`);
			});

			// https://github.com/vitejs/vite/issues/10340
			test('mixed css + scss types', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.mixedScssModules);
				onTestFinish(() => fixture.rm());

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
				});

				expect(css).toMatch('--file: "css.module.css"');
				expect(css).toMatch('--file: "scss.module.scss?.module.css"');

				const exported = await import(base64Module(js));
				expect(exported['text-primary']).toMatch(/[-\w][-\dA-Z]*_[-\w]+_\w{5}/i);

				const classNames = exported['text-primary'].split(' ');
				for (const className of classNames) {
					expect(css).toMatch(`.${className}`);
				}
			});

			test('inline', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.inlineCssModules);
				onTestFinish(() => fixture.rm());

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
				});
				expect(css).toBeUndefined();

				const exported = await import(base64Module(js));
				expect(typeof exported.default).toBe('string');
				expect(exported.default).toMatch(/--file: "style.module.css\?inline"/);
			});

			test('dev server', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.multiCssModules);
				onTestFinish(() => fixture.rm());

				const code = await viteServe(
					fixture.path,
					{
						plugins: [
							patchCssModules(),
						],
					},
				);

				expect(code).toMatch('--file: \\"style1.module.css\\"');
				expect(code).toMatch('--file: \\"style2.module.css\\"');

				// Ensure that PostCSS is applied to the composed
				expect(code).toMatch('--file: \\"utils1.css?.module.css\\"');
				expect(code).toMatch('--file: \\"utils2.css?.module.css\\"');

				// Util is not duplicated despite being used twice
				const utilClass = Array.from(code.matchAll(/foo/g));
				expect(utilClass.length).toBe(1);
			});
		});

		test('PostCSS configured', async ({ onTestFinish }) => {
			const fixture = await createFixture(fixtures.multiCssModules);
			onTestFinish(() => fixture.rm());

			const { js, css } = await viteBuild(fixture.path, {
				plugins: [
					patchCssModules(),
				],
				css: {
					modules: {
						generateScopedName: 'asdf_[local]',
					},
				},
			});

			const exported = await import(base64Module(js));
			expect(exported).toMatchObject({
				style1: {
					'class-name1': expect.stringMatching(/^asdf_class-name1\s+asdf_util-class$/),
				},
				style2: {
					'class-name2': expect.stringMatching(/^asdf_class-name2\s+asdf_util-class$/),
				},
			});

			expect(css).toMatch('--file: "style1.module.css"');
			expect(css).toMatch('--file: "style2.module.css"');

			// Ensure that PostCSS is applied to the composed files
			expect(css).toMatch('--file: "utils1.css?.module.css"');
			expect(css).toMatch('--file: "utils2.css?.module.css"');

			// Util is not duplicated
			const utilClass = Array.from(css!.matchAll(/foo/g));
			expect(utilClass.length).toBe(1);
		});

		test('Empty CSS Module', async ({ onTestFinish }) => {
			const fixture = await createFixture(fixtures.emptyCssModule);
			onTestFinish(() => fixture.rm());

			const { js, css } = await viteBuild(fixture.path, {
				plugins: [
					patchCssModules(),
				],
				css: {
					modules: {
						generateScopedName: 'asdf_[local]',
					},
				},
			});

			const exported = await import(base64Module(js));
			expect(exported).toMatchObject({
				default: {},
			});
			expect(css).toBeUndefined();
		});

		describe('@value', ({ test }) => {
			test('build', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.cssModulesValues);
				onTestFinish(() => fixture.rm());

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						modules: {
							generateScopedName: '[name]_[local]',
						},
					},
				});

				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					default: {
						'class-name1': 'style-module_class-name1 utils1_util-class utils2_util-class',
						'class-name2': 'style-module_class-name2',
					},
					'class-name1': 'style-module_class-name1 utils1_util-class utils2_util-class',
					'class-name2': 'style-module_class-name2',
				});

				expect(css).toMatch('color: #fff');
				expect(css).toMatch('border: #fff');
				expect(css).toMatch('color: #000');
				expect(css).toMatch('border: #000');
				expect(css).toMatch('border: 1px solid black');

				// Ensure that PostCSS is applied to the composed files
				expect(css).toMatch('--file: "style.module.css"');
				expect(css).toMatch('--file: "utils1.css?.module.css"');
				expect(css).toMatch('--file: "utils2.css?.module.css"');
			});

			test('dev server', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.cssModulesValues);
				onTestFinish(() => fixture.rm());

				const code = await viteServe(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						modules: {
							generateScopedName: 'asdf_[local]',
						},
					},
				});

				expect(code).toMatch('color: #fff');
				expect(code).toMatch('border: #fff');
				expect(code).toMatch('color: #000');
				expect(code).toMatch('border: #000');
				expect(code).toMatch('border: 1px solid black');

				// Ensure that PostCSS is applied to the composed files
				expect(code).toMatch('--file: \\"style.module.css\\"');
				expect(code).toMatch('--file: \\"utils1.css?.module.css\\"');
				expect(code).toMatch('--file: \\"utils2.css?.module.css\\"');
			});
		});
	});
});
