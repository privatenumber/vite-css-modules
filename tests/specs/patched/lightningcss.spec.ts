import { createFixture } from 'fs-fixture';
import { testSuite, expect } from 'manten';
import { Features } from 'lightningcss';
import vitePluginVue from '@vitejs/plugin-vue';
import { base64Module } from '../../utils/base64-module.js';
import * as fixtures from '../../fixtures.js';
import { viteBuild, viteServe } from '../../utils/vite.js';
import { getCssSourceMaps } from '../../utils/get-css-source-maps.js';
import { patchCssModules } from '#vite-css-modules';

export default testSuite(({ describe }) => {
	describe('LightningCSS', ({ test, describe }) => {
		test('Configured', async ({ onTestFinish }) => {
			const fixture = await createFixture(fixtures.multiCssModules);
			onTestFinish(() => fixture.rm());

			const { js, css } = await viteBuild(fixture.path, {
				plugins: [
					patchCssModules(),
				],
				css: {
					transformer: 'lightningcss',
				},
				build: {
					target: 'es2022',
				},
			});

			const exported = await import(base64Module(js));
			expect(exported).toMatchObject({
				style1: {
					className1: expect.stringMatching(/^[\w-]+_className1\s+[\w-]+_util-class$/),
					default: {
						className1: expect.stringMatching(/^[\w-]+_className1\s+[\w-]+_util-class$/),
						'class-name2': expect.stringMatching(/^[\w-]+_class-name2\s+[\w-]+_util-class\s+[\w-]+_util-class$/),
					},
				},
				style2: {
					'class-name2': expect.stringMatching(/^[\w-]+_class-name2\s+[\w-]+_util-class$/),
					default: {
						'class-name2': expect.stringMatching(/^[\w-]+_class-name2\s+[\w-]+_util-class$/),
					},
				},
			});

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
					transformer: 'lightningcss',
				},
			});

			const exported = await import(base64Module(js));
			expect(exported).toMatchObject({
				default: {},
			});
			expect(css).toBe('\n');
		});

		test('reserved keywords', async ({ onTestFinish }) => {
			const fixture = await createFixture(fixtures.reservedKeywords);
			onTestFinish(() => fixture.rm());

			const { js } = await viteBuild(fixture.path, {
				plugins: [
					patchCssModules(),
				],
				build: {
					target: 'es2022',
				},
				css: {
					transformer: 'lightningcss',
				},
			});
			const exported = await import(base64Module(js));
			expect(exported).toMatchObject({
				style: {
					default: {
						export: 'fk9XWG_export V_YH-W_with',
						import: 'fk9XWG_import V_YH-W_if',
					},
					export: 'fk9XWG_export V_YH-W_with',
					import: 'fk9XWG_import V_YH-W_if',
				},
			});
		});

		describe('Custom property dependencies', ({ test }) => {
			test('build', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.lightningCustomPropertiesFrom);
				onTestFinish(() => fixture.rm());

				const { js, css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						transformer: 'lightningcss',
						lightningcss: {
							cssModules: {
								dashedIdents: true,
							},
						},
					},
				});

				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style1: {
						button: expect.stringMatching(/^[\w-]+_button$/),
					},
					style2: {
						input: expect.stringMatching(/^[\w-]+input$/),
					},
				});

				const variableNameMatches = Array.from(css!.matchAll(/(\S+): hotpink/g))!;
				expect(variableNameMatches.length).toBe(1);

				const variableName = variableNameMatches[0]![1];
				expect(css).toMatch(`color: var(${variableName})`);
				expect(css).toMatch(`background: var(${variableName})`);
			});

			test('serve', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.lightningCustomPropertiesFrom);
				onTestFinish(() => fixture.rm());

				const code = await viteServe(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						transformer: 'lightningcss',
						lightningcss: {
							cssModules: {
								dashedIdents: true,
							},
						},
					},
				});

				const variableNameMatches = Array.from(code.matchAll(/(\S+): hotpink/g))!;
				expect(variableNameMatches.length).toBe(1);

				const variableName = variableNameMatches[0]![1];
				expect(code).toMatch(`color: var(${variableName})`);
				expect(code).toMatch(`background: var(${variableName})`);
			});
		});

		describe('Other configs', ({ test }) => {
			test('build', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.lightningFeatures);
				onTestFinish(() => fixture.rm());

				const { css } = await viteBuild(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						transformer: 'lightningcss',
						lightningcss: {
							include: Features.Nesting,
						},
					},
				});

				expect(css).toMatch(/\.[\w-]+_button\.[\w-]+_primary/);
			});

			test('dev server', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.lightningFeatures);
				onTestFinish(() => fixture.rm());

				const code = await viteServe(fixture.path, {
					plugins: [
						patchCssModules(),
					],
					css: {
						transformer: 'lightningcss',
						lightningcss: {
							include: Features.Nesting,
						},
					},
				});

				const cssSourcemaps = getCssSourceMaps(code);
				expect(cssSourcemaps.length).toBe(0);

				expect(code).toMatch(/\.[\w-]+_button\.[\w-]+_primary/);
			});

			test('devSourcemap', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.lightningCustomPropertiesFrom);
				onTestFinish(() => fixture.rm());

				const code = await viteServe(
					fixture.path,
					{
						plugins: [
							patchCssModules(),
						],
						css: {
							devSourcemap: true,
							transformer: 'lightningcss',
							lightningcss: {
								include: Features.Nesting,
								cssModules: {
									dashedIdents: true,
								},
							},
						},
					},
				);

				const cssSourcemaps = getCssSourceMaps(code);
				expect(cssSourcemaps.length).toBe(3);
				// I'm skeptical these source maps are correct
				// Seems lightningCSS is providing these source maps
				expect(cssSourcemaps).toMatchObject([
					{
						version: 3,
						file: expect.stringMatching(/^style1\.module\.css$/),
						mappings: 'AAAA',
						names: [],
						ignoreList: [],
						sources: [expect.stringMatching(/^style1\.module\.css$/)],
						sourcesContent: [
							'.button {\n\tbackground: var(--accent-color from "./vars.module.css");\n}',
						],
					},
					{
						version: 3,
						file: expect.stringMatching(/^style2\.module\.css$/),
						mappings: 'AAAA',
						names: [],
						ignoreList: [],
						sources: [expect.stringMatching(/^style2\.module\.css$/)],
						sourcesContent: [
							'.input {\n\tcolor: var(--accent-color from "./vars.module.css");\n}',
						],
					},
					{
						version: 3,
						sourceRoot: null,
						mappings: 'AAAA',
						sources: [expect.stringMatching(/^vars\.module\.css$/)],
						sourcesContent: [':root {\n\t--accent-color: hotpink;\n}'],
						names: [],
					},
				]);
			});

			test('devSourcemap with Vue.js', async ({ onTestFinish }) => {
				const fixture = await createFixture(fixtures.vue);
				onTestFinish(() => fixture.rm());

				const code = await viteServe(fixture.path, {
					plugins: [
						patchCssModules(),
						vitePluginVue(),
					],
					css: {
						devSourcemap: true,
						transformer: 'lightningcss',
						lightningcss: {
							include: Features.Nesting,
						},
					},
				});

				const cssSourcemaps = getCssSourceMaps(code);
				expect(cssSourcemaps.length).toBe(2);
				expect(cssSourcemaps).toMatchObject([
					{
						version: 3,
						mappings: 'AAKA;;;;ACLA',
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
						file: expect.stringMatching(/\/comp\.vue$/),
					},
					{
						version: 3,
						mappings: 'AAAA;;;;;AAKA;;;;ACLA',
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
						file: expect.stringMatching(/\/utils\.css$/),
					},
				]);
			});
		});
	});
});
