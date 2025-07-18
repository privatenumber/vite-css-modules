import { setTimeout } from 'node:timers/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createFixture } from 'fs-fixture';
import { testSuite, expect } from 'manten';
import vitePluginVue from '@vitejs/plugin-vue';
import { outdent } from 'outdent';
import { base64Module } from '../../utils/base64-module.js';
import * as fixtures from '../../fixtures.js';
import { viteBuild, getViteDevCode, viteDevBrowser } from '../../utils/vite.js';
import { getCssSourceMaps } from '../../utils/get-css-source-maps.js';
import { patchCssModules } from '#vite-css-modules';

export default testSuite(({ describe }) => {
	describe('PostCSS', ({ test, describe }) => {
		describe('no config', ({ test }) => {
			test('build', async () => {
				await using fixture = await createFixture({
					...fixtures.multiCssModules,
					...fixtures.postcssLogFile,
				});

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
				});

				expect(css).toMatch('--file: "style1.module.css"');
				expect(css).toMatch('--file: "style2.module.css"');

				// Ensure that PostCSS is applied to the composed
				expect(css).toMatch('--file: "utils1.css?.module.css"');
				expect(css).toMatch('--file: "utils2.css?.module.css"');

				// Util is not duplicated despite being used twice
				const utilClass = Array.from(css!.matchAll(/foo/g));
				expect(utilClass.length).toBe(1);

				/*
				class-name2 from style2 is not duplicated
				despite being directly imported and also composed from
				*/
				const style2className = Array.from(css!.matchAll(/pink/g));
				expect(style2className.length).toBe(1);

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

			test('scss', async () => {
				await using fixture = await createFixture(fixtures.scssModules);

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
				});

				expect(css).toMatch('--file: "style.module.scss"');

				const exported = await import(base64Module(js));
				expect(exported['text-primary']).toMatch(/^_[-\w]+_\w{7}$/);

				const className = exported['text-primary'];
				expect(css).toMatch(`.${className}`);
			});

			// https://github.com/vitejs/vite/issues/10340
			test('mixed css + scss types', async () => {
				await using fixture = await createFixture(fixtures.mixedScssModules);

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
				});

				expect(css).toMatch('--file: "css.module.css"');
				expect(css).toMatch('--file: "scss.module.scss"');

				const exported = await import(base64Module(js));

				// eslint-disable-next-line regexp/no-super-linear-backtracking
				expect(exported['text-primary']).toMatch(/^(_[-\w]+_\w{7}\s?)+$/);

				const classNames = exported['text-primary'].split(' ');
				for (const className of classNames) {
					expect(css).toMatch(`.${className}`);
				}
			});

			test('inline', async () => {
				await using fixture = await createFixture(fixtures.inlineCssModules);

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

			// https://github.com/vitejs/vite/issues/14050
			test('reserved keywords', async () => {
				await using fixture = await createFixture(fixtures.reservedKeywords);

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						default: {
							import: '_import_1f0f104 _if_36a6377',
							export: '_export_31ef8f2 _with_779bcbb',
						},
						export: '_export_31ef8f2 _with_779bcbb',
						import: '_import_1f0f104 _if_36a6377',
					},
				});
			});

			test('dev server', async () => {
				await using fixture = await createFixture({
					...fixtures.multiCssModules,
					...fixtures.postcssLogFile,
					node_modules: ({ symlink }) => symlink(path.resolve('node_modules')),
				});

				const code = await getViteDevCode(
					fixture.path,
					{
						plugins: [
							patchCssModules(),
						],
					},
				);

				const cssSourcemaps = getCssSourceMaps(code);
				expect(cssSourcemaps.length).toBe(0);

				expect(code).toMatch(String.raw`--file: \"style1.module.css\"`);
				expect(code).toMatch(String.raw`--file: \"style2.module.css\"`);

				// Ensure that PostCSS is applied to the composed
				expect(code).toMatch(String.raw`--file: \"utils1.css?.module.css\"`);
				expect(code).toMatch(String.raw`--file: \"utils2.css?.module.css\"`);

				// Util is not duplicated despite being used twice
				const utilClass = Array.from(code.matchAll(/foo/g));
				expect(utilClass.length).toBe(1);
			});

			test('devSourcemap', async () => {
				await using fixture = await createFixture({
					...fixtures.cssModulesValues,
					node_modules: ({ symlink }) => symlink(path.resolve('node_modules')),
				});

				const code = await getViteDevCode(
					fixture.path,
					{
						plugins: [
							patchCssModules(),
						],
						css: {
							devSourcemap: true,
						},
					},
				);

				const cssSourcemaps = getCssSourceMaps(code);
				expect(cssSourcemaps.length).toBe(3);
				expect(cssSourcemaps).toMatchObject([
					{
						version: 3,
						file: expect.stringMatching(/\/style\.module\.css$/),
						mappings: 'AAGA;QACC,IAAS;SACT,eAAqB;AAGtB;AACA;QACC,IAAS;AACV;ACXA',
						names: [],
						sources: [
							expect.stringMatching(/\/style\.module\.css$/),
							'\u0000<no source>',
						],
						sourcesContent: [
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
							null,
						],
					},
					{
						version: 3,
						file: expect.stringMatching(/\/utils1\.css$/),
						mappings: 'AAGA;CACC,YAAe;AAChB;;ACLA;CAAA',
						names: [],
						sources: [
							expect.stringMatching(/\/utils1\.css$/),
							'\u0000<no source>',
						],
						sourcesContent: [
							'@value primary: #fff;\n'
							+ '@value simple-border: 1px solid black;\n'
							+ '\n'
							+ '.util-class {\n'
							+ '\tborder: primary;\n'
							+ '}',
							null,
						],
					},
					{
						version: 3,
						file: expect.stringMatching(/\/utils2\.css$/),
						mappings: 'AAEA;CACC,YAAe;AAChB;;ACJA;CAAA',
						names: [],
						sources: [
							expect.stringMatching(/\/utils2\.css$/),
							'\u0000<no source>',
						],
						sourcesContent: [
							'@value primary: #000;\n\n.util-class {\n\tborder: primary;\n}',
							null,
						],
					},
				]);
			});

			test('devSourcemap with Vue.js', async () => {
				await using fixture = await createFixture({
					...fixtures.vue,
					node_modules: ({ symlink }) => symlink(path.resolve('node_modules')),
				});

				const code = await getViteDevCode(fixture.path, {
					plugins: [
						patchCssModules(),
						vitePluginVue(),
					],
					css: {
						devSourcemap: true,
					},
				});

				const cssSourcemaps = getCssSourceMaps(code);
				expect(cssSourcemaps.length).toBe(2);
				expect(cssSourcemaps).toMatchObject([
					{
						version: 3,
						file: expect.stringMatching(/\/comp\.vue$/),
						mappings: 'AAKA;CAEC,UAAU;AACX;ACRA;CAAA',
						names: [],
						sources: [
							expect.stringMatching(/\/comp\.vue$/),
							'\u0000<no source>',
						],
						sourcesContent: [
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
							null,
						],
					},
					{
						version: 3,
						file: expect.stringMatching(/\/utils\.css$/),
						mappings: 'AAAA;CACC,aAAa;CACb,WAAW;AACZ;;AAEA;CACC,aAAa;AACd;;ACPA;CAAA',
						names: [],
						sources: [
							expect.stringMatching(/\/utils\.css$/),
							'\u0000<no source>',
						],
						sourcesContent: [
							'.util-class {\n'
							+ "\t--name: 'foo';\n"
							+ '\tcolor: blue;\n'
							+ '}\n'
							+ '\n'
							+ '.unused-class {\n'
							+ '\tcolor: yellow;\n'
							+ '}',
							null,
						],
					},
				]);
			});
		});

		test('PostCSS configured', async () => {
			await using fixture = await createFixture({
				...fixtures.multiCssModules,
				...fixtures.postcssLogFile,
			});

			const { js, css } = await viteBuild(fixture.path, {
				plugins: [
					patchCssModules(),
				],
				build: {
					target: 'es2022',
				},
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
			test('camelCase', async () => {
				await using fixture = await createFixture(fixtures.multiCssModules);

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
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

			test('camelCaseOnly', async () => {
				await using fixture = await createFixture(fixtures.multiCssModules);

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

			test('dashes', async () => {
				await using fixture = await createFixture(fixtures.multiCssModules);

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
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

			test('dashesOnly', async () => {
				await using fixture = await createFixture(fixtures.multiCssModules);

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

			test('function', async () => {
				await using fixture = await createFixture(fixtures.multiCssModules);

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
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

		test('globalModulePaths', async () => {
			await using fixture = await createFixture(fixtures.globalModule);

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

		test('getJSON', async () => {
			await using fixture = await createFixture(fixtures.multiCssModules);

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

		test('Empty CSS Module', async () => {
			await using fixture = await createFixture(fixtures.emptyCssModule);

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
			test('build', async () => {
				await using fixture = await createFixture(fixtures.cssModulesValues);

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
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

			test('@value multiple exports', async () => {
				await using fixture = await createFixture(fixtures.cssModulesValuesMultipleExports);

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
				});

				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					'class-name1': expect.stringMatching(/^_class-name1_\w+ _class-name2_\w+/),
					'class-name2': expect.stringMatching(/^_class-name2_\w+$/),
				});

				// Assert that class-name2 only appears once
				const utilClass = Array.from(css!.matchAll(/\._class-name2_/g));
				expect(utilClass.length).toBe(1);
			});
		});

		describe('error handling', ({ test }) => {
			test('missing class export', async () => {
				await using fixture = await createFixture(fixtures.missingClassExport);

				await expect(() => viteBuild(fixture.path, {
					logLevel: 'silent',
					plugins: [
						patchCssModules(),
					],
				})).rejects.toThrow('Cannot resolve "non-existent" from "./utils.css"');
			});

			test('exporting a non-safe class name via esm doesnt throw', async () => {
				await using fixture = await createFixture(fixtures.moduleNamespace);

				await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
				});
			});
		});

		describe('.d.ts', ({ test }) => {
			test('exportMode: both', async () => {
				await using fixture = await createFixture(fixtures.reservedKeywords);

				await viteBuild(fixture.path, {
					plugins: [
						patchCssModules({
							generateSourceTypes: true,
						}),
					],
					build: {
						target: 'es2022',
					},
					css: {
						modules: {
							localsConvention: 'camelCase',
						},
					},
				});
				const files = await readdir(fixture.path);
				expect(files).toStrictEqual([
					'dist',
					'index.js',
					'node_modules',
					'style.module.css',
					'style.module.css.d.ts',
					'utils.css',
				]);
				const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dts).toBe(
					outdent`
					/* eslint-disable */
					/* prettier-ignore */
					// @ts-nocheck
					/**
					 * Generated by vite-css-modules
					 * https://npmjs.com/vite-css-modules
					 */

					const _import: string;
					const _export: string;
					const _default: string;

					export {
						_import as "import",
						_export as "export"
					};

					export default {
						"import": _import,
						"export": _export,
						"default": _default
					};

					`,
				);
			});

			test('exportMode: named', async () => {
				await using fixture = await createFixture(fixtures.reservedKeywords);

				await viteBuild(fixture.path, {
					plugins: [
						patchCssModules({
							generateSourceTypes: true,
							exportMode: 'named',
						}),
					],
					build: {
						target: 'es2022',
					},
					css: {
						modules: {
							localsConvention: 'camelCase',
						},
					},
				});
				const files = await readdir(fixture.path);
				expect(files).toStrictEqual([
					'dist',
					'index.js',
					'node_modules',
					'style.module.css',
					'style.module.css.d.ts',
					'utils.css',
				]);
				const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dts).toBe(
					outdent`
					/* eslint-disable */
					/* prettier-ignore */
					// @ts-nocheck
					/**
					 * Generated by vite-css-modules
					 * https://npmjs.com/vite-css-modules
					 */

					const _import: string;
					const _export: string;
					const _default: string;

					export {
						_import as "import",
						_export as "export",
						_default as "default"
					};

					`,
				);
			});

			test('exportMode: default', async () => {
				await using fixture = await createFixture(fixtures.reservedKeywords);

				await viteBuild(fixture.path, {
					plugins: [
						patchCssModules({
							generateSourceTypes: true,
							exportMode: 'default',
						}),
					],
					build: {
						target: 'es2022',
					},
					css: {
						modules: {
							localsConvention: 'camelCase',
						},
					},
				});
				const files = await readdir(fixture.path);
				expect(files).toStrictEqual([
					'dist',
					'index.js',
					'node_modules',
					'style.module.css',
					'style.module.css.d.ts',
					'utils.css',
				]);
				const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dts).toBe(
					outdent`
					/* eslint-disable */
					/* prettier-ignore */
					// @ts-nocheck
					/**
					 * Generated by vite-css-modules
					 * https://npmjs.com/vite-css-modules
					 */

					const _import: string;
					const _export: string;
					const _default: string;

					export default {
						"import": _import,
						"export": _export,
						"default": _default
					};

					`,
				);
			});

			test('empty css module creates empty .d.ts', async () => {
				await using fixture = await createFixture({
					'index.js': 'export * as style from \'./style.module.css\';',
					'style.module.css': '',
				});
				await viteBuild(fixture.path, {
					plugins: [
						patchCssModules({
							generateSourceTypes: true,
						}),
					],
					build: {
						target: 'es2022',
					},
					css: {
						modules: {
							localsConvention: 'camelCase',
						},
					},
				});
				const files = await readdir(fixture.path);
				expect(files).toStrictEqual([
					'dist',
					'index.js',
					'node_modules',
					'style.module.css',
					'style.module.css.d.ts',
				]);
				const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
				expect(dts).toBe(
					outdent`
					/* eslint-disable */
					/* prettier-ignore */
					// @ts-nocheck
					/**
					 * Generated by vite-css-modules
					 * https://npmjs.com/vite-css-modules
					 */

					`,
				);
			});
		});

		describe('exportMode', ({ test }) => {
			test('both (default)', async () => {
				await using fixture = await createFixture(fixtures.exportModeBoth);

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules({
							exportMode: 'both',
						}),
					],
					build: {
						target: 'es2022',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						default: {
							class: '_class_6a3525e _util_f9ba12f',
						},
						class: '_class_6a3525e _util_f9ba12f',
					},
				});
			});

			test('named', async () => {
				await using fixture = await createFixture(fixtures.exportModeBoth);

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules({
							exportMode: 'named',
						}),
					],
					build: {
						target: 'es2022',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						class: '_class_6a3525e _util_f9ba12f',
					},
				});
				expect(exported.style.default).toBeUndefined();
			});

			test('default', async () => {
				await using fixture = await createFixture(fixtures.exportModeBoth);

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules({
							exportMode: 'default',
						}),
					],
					build: {
						target: 'es2022',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						default: {
							class: '_class_6a3525e _util_f9ba12f',
						},
					},
				});

				expect(
					Object.keys(exported.style).length,
				).toBe(1);
			});
		});

		describe('default as named export', ({ test }) => {
			test('should warn & omit `default` from named export', async () => {
				await using fixture = await createFixture(fixtures.defaultAsName);

				const { js, warnings } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						default: {
							typeof: '_typeof_06003d4',
							default: '_default_1733f38',
						},
						typeof: '_typeof_06003d4',
					},
				});
				expect(warnings).toHaveLength(1);
				expect(warnings[0]).toMatch('you cannot use "default" as a class name');
			});

			test('should work with exportMode: \'default\'', async () => {
				await using fixture = await createFixture(fixtures.defaultAsName);

				const { js, warnings } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules({
							exportMode: 'default',
						}),
					],
					build: {
						target: 'es2022',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						default: {
							default: '_default_1733f38',
							typeof: '_typeof_06003d4',
						},
					},
				});
				expect(warnings).toHaveLength(0);
			});

			test('should work with exportMode: \'named\'', async () => {
				await using fixture = await createFixture(fixtures.defaultAsName);

				const { js, warnings } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules({
							exportMode: 'named',
						}),
					],
					build: {
						target: 'es2022',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						typeof: '_typeof_06003d4',
						default: '_default_1733f38',
					},
				});
				expect(warnings).toHaveLength(0);
			});

			test('composes default', async () => {
				await using fixture = await createFixture(fixtures.defaultAsComposedName);

				const { js } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					build: {
						target: 'es2022',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						default: {
							typeof: '_typeof_06003d4 _default_59c1934',
						},
						typeof: '_typeof_06003d4 _default_59c1934',
					},
				});
			});
		});

		test('queries in requests should be preserved', async () => {
			await using fixture = await createFixture(fixtures.requestQuery);
			const { css } = await viteBuild(fixture.path, {
				plugins: [
					patchCssModules(),
				],
				build: {
					target: 'es2022',
				},
			});
			expect(css).toMatch('style.module.css?some-query');
		});

		test('hmr', async () => {
			await using fixture = await createFixture(fixtures.viteDev);

			await viteDevBrowser(
				fixture.path,
				{
					plugins: [
						patchCssModules(),
					],
				},
				async (page) => {
					const textColorBefore = await page.evaluate('getComputedStyle(myText).color');
					expect(textColorBefore).toBe('rgb(255, 0, 0)');

					const newColor = fixtures.newRgb();
					const newFile = fixtures.viteDev['style1.module.css'].replace('red', newColor);
					await fixture.writeFile('style1.module.css', newFile);

					await setTimeout(1000);

					const textColorAfter = await page.evaluate('getComputedStyle(myText).color');
					expect(textColorAfter).toBe(newColor);
				},
			);
		});

		test('hmr outside root', async () => {
			await using fixture = await createFixture(fixtures.viteDevOutsideRoot);

			await viteDevBrowser(
				fixture.getPath('nested-dir'),
				{
					plugins: [
						patchCssModules(),
					],
				},
				async (page) => {
					const textColorBefore = await page.evaluate('getComputedStyle(myText).color');
					expect(textColorBefore).toBe('rgb(255, 0, 0)');

					const newColor = fixtures.newRgb();
					const newFile = fixtures.viteDevOutsideRoot['style1.module.css'].replace('red', newColor);
					await fixture.writeFile('style1.module.css', newFile);

					await setTimeout(1000);

					const textColorAfter = await page.evaluate('getComputedStyle(myText).color');
					expect(textColorAfter).toBe(newColor);
				},
			);
		});

		test('enabling sourcemap doesnt emit warning', async () => {
			await using fixture = await createFixture(fixtures.multiCssModules);

			const { warnings } = await viteBuild(fixture.path, {
				plugins: [
					patchCssModules(),
				],
				build: {
					sourcemap: true,
				},
			});

			expect(warnings).toHaveLength(0);
		});
	});
});
