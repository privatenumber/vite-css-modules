import { createFixture } from 'fs-fixture';
import { testSuite, expect } from 'manten';
import { Features } from 'lightningcss';
import { base64Module } from '../../utils/base64-module.js';
import * as fixtures from '../../fixtures.js';
import { viteBuild, viteServe } from '../../utils/vite.js';

import { patchCssModules } from '#vite-css-modules';

export default testSuite(({ describe }) => {
	describe('LightningCSS', ({ test }) => {
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

			test('serve', async ({ onTestFinish }) => {
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

				expect(code).toMatch(/\.[\w-]+_button\.[\w-]+_primary/);
			});
		});
	});
});
