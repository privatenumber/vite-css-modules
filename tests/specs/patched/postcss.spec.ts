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
				expect(exported).toMatchObject({
					style1: {
						'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
						default: {
							className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
							'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						},
					},
					style2: {
						'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						default: {
							'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						},
					},
				});

				const classes = [
					...exported.style1.className1.split(' '),
					...exported.style1['class-name2'].split(' '),
					...exported.style2['class-name2'].split(' '),
				];

				for (const className of classes) {
					// eslint-disable-next-line regexp/no-super-linear-backtracking
					expect(className).toMatch(/^(_[-\w]+_\w{7}\s?)+$/);
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
				expect(exported['text-primary']).toMatch(/^_[-\w]+_\w{7}$/);

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

				// eslint-disable-next-line regexp/no-super-linear-backtracking
				expect(exported['text-primary']).toMatch(/^(_[-\w]+_\w{7}\s?)+$/);

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
					className1: expect.stringMatching(/^asdf_className1\s+asdf_util-class$/),
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

		describe('localsConvention', ({ test }) => {
			test('camelCase', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.multiCssModules);
				onTestFinish(() => fixture.rm());

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						modules: {
							localsConvention: 'camelCase',
						},
					},
				});

				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style1: {
						'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
						className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						default: {
							className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
							'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
							className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						},
					},
					style2: {
						'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						default: {
							'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
							className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						},
					},
				});
			});

			test('camelCaseOnly', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.multiCssModules);
				onTestFinish(() => fixture.rm());

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						modules: {
							localsConvention: 'camelCaseOnly',
						},
					},
				});

				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style1: {
						className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
						className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						default: {
							className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
							className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						},
					},
					style2: {
						className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						default: {
							className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						},
					},
				});
			});

			test('dashes', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.multiCssModules);
				onTestFinish(() => fixture.rm());

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						modules: {
							localsConvention: 'dashes',
						},
					},
				});

				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style1: {
						'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
						className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						default: {
							className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
							'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
							className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						},
					},
					style2: {
						'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						default: {
							'class-name2': expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
							className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						},
					},
				});
			});

			test('dashesOnly', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.multiCssModules);
				onTestFinish(() => fixture.rm());

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						modules: {
							localsConvention: 'dashesOnly',
						},
					},
				});

				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style1: {
						className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
						className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						default: {
							className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
							className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						},
					},
					style2: {
						className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						default: {
							className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						},
					},
				});
			});

			test('function', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.multiCssModules);
				onTestFinish(() => fixture.rm());

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						modules: {
							localsConvention: originalClassname => `${originalClassname}123`,
						},
					},
				});

				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style1: {
						className1123: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
						'class-name2123': expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						default: {
							className1123: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
							'class-name2123': expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
						},
					},
					style2: {
						'class-name2123': expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						default: {
							'class-name2123': expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
						},
					},
				});
			});
		});

		test('globalModulePaths', async ({ onTestFinish }) => {
			const fixture = await createFixture(fixtures.globalModule);
			onTestFinish(() => fixture.rm());

			const { js, css } = await viteBuild(fixture.path, {
				plugins: [
					patchCssModules(),
				],
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

		test('getJSON', async ({ onTestFinish }) => {
			const fixture = await createFixture(fixtures.multiCssModules);
			onTestFinish(() => fixture.rm());

			type JSON = {
				inputFile: string;
				exports: Record<string, string>;
				outputFile: string;
			};
			const jsons: JSON[] = [];

			await viteBuild(fixture.path, {
				plugins: [
					patchCssModules(),
				],
				css: {
					modules: {
						localsConvention: 'camelCaseOnly',
						getJSON: (inputFile, exports, outputFile) => {
							jsons.push({
								inputFile,
								exports,
								outputFile,
							});
						},
					},
				},
			});

			// This plugin treats each CSS Module as a JS module so it emits on each module
			// rather than the final "bundle" which postcss-module emits on
			expect(jsons).toHaveLength(4);
			jsons.sort((a, b) => a.inputFile.localeCompare(b.inputFile));

			const [style1, style2, utils1, utils2] = jsons;
			expect(style1).toMatchObject({
				inputFile: expect.stringMatching(/style1\.module\.css$/),
				exports: {
					className1: expect.stringMatching(/_className1_\w+ _util-class_\w+/),
					className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+ _util-class_\w+/),
				},
				outputFile: expect.stringMatching(/style1\.module\.css$/),
			});

			expect(style2).toMatchObject({
				inputFile: expect.stringMatching(/style2\.module\.css$/),
				exports: {
					className2: expect.stringMatching(/_class-name2_\w+ _util-class_\w+/),
				},
				outputFile: expect.stringMatching(/style2\.module\.css$/),
			});

			expect(utils1).toMatchObject({
				inputFile: expect.stringMatching(/utils1\.css\?\.module\.css$/),
				exports: {
					unusedClass: expect.stringMatching(/_unused-class_\w+/),
					utilClass: expect.stringMatching(/_util-class_\w+/),
				},
				outputFile: expect.stringMatching(/utils1\.css\?\.module\.css$/),
			});

			expect(utils2).toMatchObject({
				inputFile: expect.stringMatching(/utils2\.css\?\.module\.css$/),
				exports: {
					utilClass: expect.stringMatching(/_util-class_\w+/),
				},
				outputFile: expect.stringMatching(/utils2\.css\?\.module\.css$/),
			});
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
				});

				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					default: {
						'class-name1': expect.stringMatching(/^_class-name1_\w+ _util-class_\w+ _util-class_\w+$/),
						'class-name2': expect.stringMatching(/^_class-name2_\w+$/),
					},
					'class-name1': expect.stringMatching(/_class-name1_\w+ _util-class_\w+ _util-class_\w+/),
					'class-name2': expect.stringMatching(/^_class-name2_\w+$/),
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

		describe('error handling', ({ test }) => {
			test('missing class export', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.missingClassExport);
				onTestFinish(() => fixture.rm());

				await expect(() => viteBuild(fixture.path, {
					logLevel: 'silent',
					plugins: [
						patchCssModules(),
					],
				})).rejects.toThrow('[vite:css-modules] Cannot resolve "non-existent" from "./utils.css"');
			});
		});
	});
});
