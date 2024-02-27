import { ResolvedConfig, Plugin } from 'vite';

declare const pluginName = "vite:css-modules";
declare const cssModules: (config: ResolvedConfig) => Plugin;

declare const patchCssModules: () => Plugin;

export { cssModules, patchCssModules, pluginName };
