import { createFixture } from 'fs-fixture';
import { testSuite, expect } from 'manten';
import type { CssSyntaxError } from 'postcss';
import vitePluginVue from '@vitejs/plugin-vue';
import { base64Module } from '../utils/base64-module.js';
import * as fixtures from '../fixtures.js';
import { viteBuild, viteServe } from '../utils/vite.js';
import { getCssSourceMaps } from '../utils/get-css-source-maps.js';

export default testSuite(({ describe }) => {
	describe('reproductions', ({ describe }) => {
		describe('postcss (no config)', ({ test, describe }) => {
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

				const cssSourcemaps = getCssSourceMaps(code);
				expect(cssSourcemaps.length).toBe(0);

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

			test('devSourcemap', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.cssModulesValues);
				onTestFinish(() => fixture.rm());

				const code = await viteServe(fixture.path, {
					css: {
						devSourcemap: true,
					},
				});

				const cssSourcemaps = getCssSourceMaps(code);
				expect(cssSourcemaps.length).toBe(1);
				expect(cssSourcemaps).toMatchObject([
					{
						file: expect.stringMatching(/\/style\.module\.css$/),
						mappings: 'AAAA;CAAA,aAAA;CAAA;CAAA,aAAA;CAAA;ACGA;CACC,WAAS;CACT,uBAAqB;AAGtB;AACA;CACC,WAAS;AACV;ADXA;CAAA;CAAA',
						names: [],
						sources: [
							'\u0000<no source>',
							expect.stringMatching(/\/style\.module\.css$/),
						],
						sourcesContent: [
							null,
							"@value primary as p1, simple-border from './utils1.css';\n"
							+ "@value primary as p2 from './utils2.css';\n"
							+ '\n'
							+ '.class-name1 {\n'
							+ '\tcolor: p1;\n'
							+ '\tborder: simple-border;\n'
							+ "\tcomposes: util-class from './utils1.css';\n"
							+ "\tcomposes: util-class from './utils2.css';\n"
							+ '}\n'
							+ '.class-name2 {\n'
							+ '\tcolor: p2;\n'
							+ '}',
						],
						version: 3,
					},
				]);
			});

			test('devSourcemap with Vue.js', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.vue);
				onTestFinish(() => fixture.rm());

				const code = await viteServe(fixture.path, {
					plugins: [
						vitePluginVue(),
					],
					css: {
						devSourcemap: true,
					},
				});

				const cssSourcemaps = getCssSourceMaps(code);
				expect(cssSourcemaps).toMatchObject([
					{
						version: 3,
						file: expect.stringMatching(/\/comp\.vue$/),
						mappings: 'AAAA;CAAA;CAAA;CAAA;CAAA;;ACKA;CAEC,UAAU;AACX;ADRA;CAAA',
						names: [],
						sources: [
							'\u0000<no source>',
							expect.stringMatching(/\/comp\.vue$/),
						],
						sourcesContent: [
							null,
							'<template>\n'
							+ '\t<p :class="$style[\'css-module\']">&lt;css&gt; module</p>\n'
							+ '</template>\n'
							+ '\n'
							+ '<style module>\n'
							+ '.css-module {\n'
							+ "\tcomposes: util-class from './utils.css';\n"
							+ '\tcolor: red;\n'
							+ '}\n'
							+ '</style>',
						],
					},
				]);
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

			// To understand expected behavior
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

			// To understand expected behavior
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

				expect(jsons).toHaveLength(2);
				jsons.sort((a, b) => a.inputFile.localeCompare(b.inputFile));

				const [style1, style2] = jsons;
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
			});

			describe('error handling', ({ test }) => {
				test('missing class export does not error', async ({ onTestFinish }) => {
					const fixture = await createFixture(fixtures.missingClassExport);
					onTestFinish(() => fixture.rm());

					const { js } = await viteBuild(fixture.path);
					const exported = await import(base64Module(js));
					expect(exported).toMatchObject({
						className1: '_className1_innx3_1 undefined',
						default: {
							className1: '_className1_innx3_1 undefined',
						},
					});
				});
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

					const cssSourcemaps = getCssSourceMaps(code);
					expect(cssSourcemaps.length).toBe(0);

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

			test('devSourcemap', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.lightningCustomPropertiesFrom);
				onTestFinish(() => fixture.rm());

				const code = await viteServe(fixture.path, {
					css: {
						transformer: 'lightningcss',
						devSourcemap: true,
						lightningcss: {
							cssModules: {
								dashedIdents: true,
							},
						},
					},
				});

				const cssSourcemaps = getCssSourceMaps(code);
				expect(cssSourcemaps.length).toBe(2);
				expect(cssSourcemaps).toMatchObject([
					{
						version: 3,
						sourceRoot: null,

						/**
						 * Can't reliably match mappings because the fixture path changes every time
						 * and even though Vite uses relative paths for the entry, they can't use relative
						 * paths for the rest of the files that Lightning resolves via bundle API
						 * https://github.com/vitejs/vite/blob/v5.0.12/packages/vite/src/node/plugins/css.ts#L2250
						 */
						// mappings: 'ACAA,oCDAA',
						sources: [
							'style1.module.css',
							expect.stringMatching(/\/vars\.module\.css$/),
						],
						sourcesContent: [
							'.button {\n\tbackground: var(--accent-color from "./vars.module.css");\n}',
							':root {\n\t--accent-color: hotpink;\n}',
						],
						names: [],
					},
					{
						version: 3,
						sourceRoot: null,
						// mappings: 'ACAA,oCDAA',
						sources: [
							'style2.module.css',
							expect.stringMatching(/\/vars\.module\.css$/),
						],
						sourcesContent: [
							'.input {\n\tcolor: var(--accent-color from "./vars.module.css");\n}',
							':root {\n\t--accent-color: hotpink;\n}',
						],
						names: [],
					},
				]);
			});
		});
	});
});
