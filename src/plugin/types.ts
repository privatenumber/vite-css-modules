import type { CSSModuleReferences } from 'lightningcss';
import type { LightningCSSOptions } from 'vite';
import type { CSSModuleExports } from './transformers/postcss/types.js';

export type Transformer<Options> = (
	code: string,
	id: string,
	config?: Options,
	lightningCssOptions?: LightningCSSOptions,
) => {
	code: string;
	exports: CSSModuleExports;
	references: CSSModuleReferences;
};
