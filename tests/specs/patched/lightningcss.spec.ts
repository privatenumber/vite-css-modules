import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { createFixture } from 'fs-fixture';
import { testSuite, expect } from 'manten';
import { decode } from '@jridgewell/sourcemap-codec';
import { Features } from 'lightningcss';
import vitePluginVue from '@vitejs/plugin-vue';
import { base64Module } from '../../utils/base64-module.js';
import * as fixtures from '../../fixtures.js';
import { viteBuild, getViteDevCode, viteDevBrowser } from '../../utils/vite.js';
import { getCssSourceMaps } from '../../utils/get-css-source-maps.js';
import { patchCssModules } from '#vite-css-modules';

export default testSuite(({ describe }) => {
	describe('LightningCSS', ({ test, describe }) => {
		test('Configured', async () => {
			await using fixture = await createFixture(fixtures.multiCssModules);

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
					className1: expect.stringMatching(/^[\w-]+_className1 [\w-]+_util-class$/),
					default: {
						className1: expect.stringMatching(/^[\w-]+_className1 [\w-]+_util-class$/),
						'class-name2': expect.stringMatching(/^[\w-]+_class-name2 [\w-]+_util-class [\w-]+_util-class [\w-]+_class-name2 [\w-]+_util-class$/),
					},
				},
				style2: {
					'class-name2': expect.stringMatching(/^[\w-]+_class-name2 [\w-]+_util-class$/),
					default: {
						'class-name2': expect.stringMatching(/^[\w-]+_class-name2 [\w-]+_util-class$/),
					},
				},
			});

			// Util is not duplicated
			const utilityClass = Array.from(css!.matchAll(/foo/g));
			expect(utilityClass.length).toBe(1);
		});

		test('Empty CSS Module', async () => {
			await using fixture = await createFixture(fixtures.emptyCssModule);

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
			test('build', async () => {
				await using fixture = await createFixture(fixtures.lightningCustomPropertiesFrom);

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

			test('serve', async () => {
				await using fixture = await createFixture(fixtures.lightningCustomPropertiesFrom);

				const code = await getViteDevCode(fixture.path, {
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
			test('build', async () => {
				await using fixture = await createFixture(fixtures.lightningFeatures);

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

			test('dev server', async () => {
				await using fixture = await createFixture(fixtures.lightningFeatures);

				const code = await getViteDevCode(fixture.path, {
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

			test('devSourcemap', async () => {
				await using fixture = await createFixture(fixtures.lightningCustomPropertiesFrom);

				const code = await getViteDevCode(
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

		test('.d.ts', async () => {
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
					transformer: 'lightningcss',
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
			expect(dts).toMatch('const _import: string');
			expect(dts).toMatch('_import as "import"');
		});

		describe('declarationMap', ({ test }) => {
			const extractInlineSourceMap = (dts: string) => {
				const match = dts.match(/\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,(.+)/);
				if (!match) {
					return null;
				}
				return JSON.parse(Buffer.from(match[1]!, 'base64').toString('utf8'));
			};

			test('maps class names to CSS positions', async () => {
				await using fixture = await createFixture(fixtures.reservedKeywords);

				await viteBuild(fixture.path, {
					plugins: [
						patchCssModules({
							generateSourceTypes: true,
							declarationMap: true,
						}),
					],
					build: {
						target: 'es2022',
					},
					css: {
						transformer: 'lightningcss',
					},
				});

				const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
				const dtsMap = extractInlineSourceMap(dts);

				expect(dtsMap.version).toBe(3);
				expect(dtsMap.file).toBe('style.module.css.d.ts');
				expect(dtsMap.sources).toStrictEqual(['style.module.css']);

				const decoded = decode(dtsMap.mappings);

				// LightningCSS sorts exports alphabetically: default, export, import
				// declare const lines start at .d.ts line 8 (0-indexed)
				expect(decoded[8]).toStrictEqual([[14, 0, 9, 0]]); // _default → .default at CSS line 10
				expect(decoded[9]).toStrictEqual([[14, 0, 5, 0]]); // _export → .export at CSS line 6
				expect(decoded[10]).toStrictEqual([[14, 0, 0, 0]]); // _import → .import at CSS line 1
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
					css: {
						transformer: 'lightningcss',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						default: {
							class: 'fk9XWG_class V_YH-W_util',
						},
						class: 'fk9XWG_class V_YH-W_util',
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
					css: {
						transformer: 'lightningcss',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						class: 'fk9XWG_class V_YH-W_util',
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
					css: {
						transformer: 'lightningcss',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						default: {
							class: 'fk9XWG_class V_YH-W_util',
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
					css: {
						transformer: 'lightningcss',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						default: {
							typeof: 'fk9XWG_typeof',
							default: 'fk9XWG_default',
						},
						typeof: 'fk9XWG_typeof',
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
					css: {
						transformer: 'lightningcss',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						default: {
							default: 'fk9XWG_default',
							typeof: 'fk9XWG_typeof',
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
					css: {
						transformer: 'lightningcss',
					},
				});
				const exported = await import(base64Module(js));
				expect(exported).toMatchObject({
					style: {
						typeof: 'fk9XWG_typeof',
						default: 'fk9XWG_default',
					},
				});
				expect(warnings).toHaveLength(0);
			});

			test('composes default (not working)', async () => {
				await using fixture = await createFixture(fixtures.defaultAsComposedName);

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
							typeof: 'fk9XWG_typeof',
						},

						/**
						 * This should actually compose `default` from `utils.css` (Compare with postcss test)
						 * LightningCSS has special case to prevent `default` from being imported
						 * https://github.com/parcel-bundler/lightningcss/issues/908
						 */
						typeof: 'fk9XWG_typeof',
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
					cssMinify: false,
				},
				css: {
					transformer: 'lightningcss',
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
					css: {
						transformer: 'lightningcss',
					},
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
					css: {
						transformer: 'lightningcss',
					},
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
				css: {
					transformer: 'lightningcss',
				},
			});

			expect(warnings).toHaveLength(0);
		});
	});
});
