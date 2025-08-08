import path from 'path';
import type { Plugin, ServerHook } from 'vite';
import type { SourceMap } from 'rollup';
import { cssModules, type PatchConfig } from './plugin/index.js';
import { cssModuleRE } from './plugin/url-utils.js';
import type { PluginMeta } from './plugin/types.js';

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

const appendInlineSoureMap = (
	map: SourceMap | string,
): string => {
	if (typeof map !== 'string') {
		map = JSON.stringify(map);
	}

	const sourceMapUrl = `data:application/json;base64,${Buffer.from(map).toString('base64')}`;
	return `\n/*# sourceMappingURL=${sourceMapUrl} */`;
};

const supportNewCssModules = (
	viteCssPostPlugin: Plugin,
	config: {
		command: string;
		base: string;
		css?: {
			devSourcemap?: boolean;
		};
	},
	pluginInstance: Plugin,
) => {
	let { transform } = viteCssPostPlugin;

	// For Vite v7.0.0
	if (transform && 'handler' in transform) {
		transform = transform.handler;
	}

	if (typeof transform !== 'function') {
		throw new TypeError('vite:css-post plugin transform is not a function');
	}

	const newTransform: typeof transform = async function (jsCode, id, options) {
		if (cssModuleRE.test(id)) {
			this.addWatchFile(path.resolve(id));
			const inlined = inlineRE.test(id);
			const info = this.getModuleInfo(id)!;
			const pluginMeta = info.meta[pluginInstance.name] as PluginMeta | undefined;
			if (!pluginMeta) {
				// In Vitest, CSS gets disabled
				return Reflect.apply(transform, this, arguments);
			}

			let { css } = pluginMeta;

			// https://github.com/vitejs/vite/blob/57463fc53fedc8f29e05ef3726f156a6daf65a94/packages/vite/src/node/plugins/css.ts#L482
			if (config.command === 'serve') {
				if (isDirectCSSRequest(id)) {
					return css;
				}

				// server only
				if (options?.ssr) {
					return jsCode || `export default ${JSON.stringify(css)}`;
				}

				if (inlined) {
					return `export default ${JSON.stringify(css)}`;
				}

				if (config.css?.devSourcemap) {
					const map = this.getCombinedSourcemap();
					css += appendInlineSoureMap(map);
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
			const result = await Reflect.apply(transform, this, [css, id]);

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

		return Reflect.apply(transform, this, arguments);
	};

	if (viteCssPostPlugin.transform && 'handler' in viteCssPostPlugin.transform) {
		viteCssPostPlugin.transform.handler = newTransform;
	} else {
		viteCssPostPlugin.transform = newTransform;
	}
};

const supportCssModulesHMR = (
	vitePlugins: readonly Plugin[],
) => {
	const viteCssAnalysisPlugin = vitePlugins.find(plugin => plugin.name === 'vite:css-analysis');
	if (!viteCssAnalysisPlugin) {
		return;
	}

	const { configureServer } = viteCssAnalysisPlugin;
	let { transform } = viteCssAnalysisPlugin;

	// For Vite v6.3.2
	if (transform && 'handler' in transform) {
		transform = transform.handler;
	}

	if (typeof transform !== 'function') {
		throw new TypeError('vite:css-analysis plugin transform is not a function');
	}
	const tag = '?vite-css-modules?inline';

	viteCssAnalysisPlugin.configureServer = function (server) {
		const moduleGraph = server.environments
			? server.environments.client.moduleGraph
			: server.moduleGraph;
		const { getModuleById } = moduleGraph;
		moduleGraph.getModuleById = function (id: string) {
			const tagIndex = id.indexOf(tag);
			if (tagIndex !== -1) {
				id = id.slice(0, tagIndex) + id.slice(tagIndex + tag.length);
			}
			return Reflect.apply(getModuleById, this, [id]);
		};

		if (configureServer) {
			return Reflect.apply(configureServer as ServerHook, this, [server]);
		}
	};

	const newTransform: typeof transform = async function (css, id, options) {
		if (cssModuleRE.test(id)) {
			// Disable self-accept by adding `?inline` for:
			// https://github.com/vitejs/vite/blob/775bb5026ee1d7e15b75c8829e7f528c1b26c493/packages/vite/src/node/plugins/css.ts#L955-L958
			id += tag;
		}

		return Reflect.apply(transform, this, [css, id, options]);
	};

	if (viteCssAnalysisPlugin.transform && 'handler' in viteCssAnalysisPlugin.transform) {
		viteCssAnalysisPlugin.transform.handler = newTransform;
	} else {
		viteCssAnalysisPlugin.transform = newTransform;
	}
};

export const patchCssModules = (
	patchConfig?: PatchConfig,
): Plugin => ({
	name: 'patch-css-modules',
	enforce: 'pre',
	configResolved: (config) => {
		const pluginInstance = cssModules(config, patchConfig);
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
			cssConfig.transformer = 'postcss';
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
