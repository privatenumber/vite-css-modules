import { ResolvedConfig, Plugin } from 'vite';

declare const pluginName = "vite:css-modules";
type PatchConfig = {
    /**
     * Generate TypeScript declaration (.d.ts) files for CSS modules
     *
     * For example, importing `style.module.css` will create a `style.module.css.d.ts` file
     * next to it, containing type definitions for the exported CSS class names
     */
    generateSourceTypes?: boolean;
};
declare const cssModules: (config: ResolvedConfig, patchConfig?: PatchConfig) => Plugin;

declare const patchCssModules: (patchConfig?: PatchConfig) => Plugin;

export { cssModules, patchCssModules, pluginName };
