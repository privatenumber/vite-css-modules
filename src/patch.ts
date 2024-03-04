import path from 'path';
import type { Plugin } from 'vite';
import { cssModules, cssModuleRE } from './plugin/index.js';

// https://github.com/vitejs/vite/blob/57463fc53fedc8f29e05ef3726f156a6daf65a94/packages/vite/src/node/plugins/css.ts#L185-L195
const directRequestRE = /[?&]direct\b/;
const inlineRE = /[?&]inline\b/;

const CSS_LANGS_RE = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

const isDirectCSSRequest = (
	request: string,
): boolean => (
	CSS_LANGS_RE.test(request)
	&& directRequestRE.test(request)
);

const supportNewCssModules = (
	viteCssPostPlugin: Plugin,
	config: {
		command: string;
		base: string;
	},
	pluginInstance: Plugin,
) => {
	const { transform: viteCssPostPluginTransform } = viteCssPostPlugin;
	if (typeof viteCssPostPluginTransform !== 'function') {
		throw new TypeError('vite:css-post plugin transform is not a function');
	}

	viteCssPostPlugin.transform = async function (jsCode, id, options) {
		if (cssModuleRE.test(id)) {
			const inlined = inlineRE.test(id);
			const info = this.getModuleInfo(id)!;
			const css = info.meta[pluginInstance.name].css as string;

			// https://github.com/vitejs/vite/blob/57463fc53fedc8f29e05ef3726f156a6daf65a94/packages/vite/src/node/plugins/css.ts#L482
			if (config.command === 'serve') {
				if (isDirectCSSRequest(id)) {
					return null;
				}

				// server only
				if (options?.ssr) {
					return jsCode || `export default ${JSON.stringify(css)}`;
				}

				if (inlined) {
					return `export default ${JSON.stringify(css)}`;
				}

				// From: https://github.com/vitejs/vite/blob/6c4bf266a0bcae8512f6daf99dff57a73ae7bcf6/packages/vite/src/node/plugins/css.ts#L506
				const code = [
					`import { updateStyle as __vite__updateStyle, removeStyle as __vite__removeStyle } from ${
						JSON.stringify(path.posix.join(config.base, '/@vite/client'))
					}`,
					`const __vite__id = ${JSON.stringify(id)}`,
					`const __vite__css = ${JSON.stringify(css)}`,
					'__vite__updateStyle(__vite__id, __vite__css)',
					// css modules exports change on edit so it can't self accept
					`${jsCode}`,
					'import.meta.hot.prune(() => __vite__removeStyle(__vite__id))',
				].join('\n');

				return {
					code,
					map: { mappings: '' },
				};
			}

			/**
			 * The CSS needs to be stored so the post plugin's renderChunk
			 * can generate an aggregated style.css file
			 * https://github.com/vitejs/vite/blob/6c4bf266a0bcae8512f6daf99dff57a73ae7bcf6/packages/vite/src/node/plugins/css.ts#L524C9-L524C15
			 */
			const result = await Reflect.apply(viteCssPostPluginTransform, this, [css, id]);

			// If it's inlined, return the minified CSS
			// https://github.com/vitejs/vite/blob/57463fc53fedc8f29e05ef3726f156a6daf65a94/packages/vite/src/node/plugins/css.ts#L530-L536
			if (inlined) {
				return result;
			}

			return {
				code: jsCode,
				map: { mappings: '' },
				moduleSideEffects: 'no-treeshake',
			};
		}

		return Reflect.apply(viteCssPostPluginTransform, this, arguments);
	};
};

const supportCssModulesHMR = (
	vitePlugins: readonly Plugin[],
) => {
	const viteCssAnalysisPlugin = vitePlugins.find(plugin => plugin.name === 'vite:css-analysis');
	if (!viteCssAnalysisPlugin) {
		return;
	}

	const {
		configureServer,
		transform,
	} = viteCssAnalysisPlugin;

	if (typeof transform !== 'function') {
		throw new TypeError('vite:css-analysis plugin transform is not a function');
	}
	if (typeof configureServer !== 'function') {
		throw new TypeError('vite:css-analysis plugin transform is not a function');
	}

	const tag = '?SPOOF?inline';
	viteCssAnalysisPlugin.configureServer = function (server) {
		const originalGetModuleById = server.moduleGraph.getModuleById.bind(server.moduleGraph);
		server.moduleGraph.getModuleById = (id: string) => {
			const tagIndex = id.indexOf(tag);
			if (tagIndex !== -1) {
				id = id.slice(0, tagIndex) + id.slice(tagIndex + tag.length);
			}
			return originalGetModuleById(id);
		};
		return Reflect.apply(configureServer, this, [server]);
	};

	viteCssAnalysisPlugin.transform = async function (css, id, options) {
		if (cssModuleRE.test(id)) {
			// Disable self-accept by adding `?inline` for:
			// https://github.com/privatenumber/vite/blob/775bb5026ee1d7e15b75c8829e7f528c1b26c493/packages/vite/src/node/plugins/css.ts#L955-L958
			id += tag;
		}
		return Reflect.apply(transform, this, [css, id, options]);
	};
};

export const patchCssModules = (): Plugin => ({
	name: 'patch-css-modules',
	enforce: 'pre',
	configResolved: (config) => {
		const pluginInstance = cssModules(config);
		const cssConfig = config.css;

		const isCssModulesDisabled = (
			cssConfig.transformer === 'lightningcss'
				? cssConfig.lightningcss?.cssModules
				: cssConfig.modules
		) === false;

		if (isCssModulesDisabled) {
			return;
		}

		// Disable CSS Modules in Vite in favor of our plugin
		// https://github.com/vitejs/vite/blob/6c4bf266a0bcae8512f6daf99dff57a73ae7bcf6/packages/vite/src/node/plugins/css.ts#L1192
		if (cssConfig.transformer === 'lightningcss') {
			if (cssConfig.lightningcss) {
				// @ts-expect-error type doesn't accept false but Vite will pass down false
				// https://github.com/vitejs/vite/blob/997a6951450640fed8cf19e58dce0d7a01b92392/packages/vite/src/node/plugins/css.ts#L2746
				cssConfig.lightningcss.cssModules = false;
			}

			/**
			 * When in Lightning mode, Lightning build API is used
			 * which will trip up on the dashedIdents feature when
			 * CSS Modules is disabled
			 *
			 * So instead we have to revert back to PostCSS, and then
			 * disable CSS Modules on PostCSS
			 */
			cssConfig.transformer = undefined;
		}

		cssConfig.modules = false;

		const viteCssPostPluginIndex = config.plugins.findIndex(plugin => plugin.name === 'vite:css-post');
		if (viteCssPostPluginIndex === -1) {
			throw new Error('vite:css-post plugin not found');
		}

		const viteCssPostPlugin = config.plugins[viteCssPostPluginIndex]!;

		// Insert before
		(config.plugins as Plugin[]).splice(
			viteCssPostPluginIndex,
			0,
			pluginInstance,
		);

		supportNewCssModules(
			viteCssPostPlugin,
			config,
			pluginInstance,
		);

		// Enable HMR by making CSS Modules not self accept
		supportCssModulesHMR(config.plugins);
	},
});
