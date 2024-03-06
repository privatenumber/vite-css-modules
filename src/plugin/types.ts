import type { CSSModuleReferences } from 'lightningcss';
import type { LightningCSSOptions } from 'vite';
import type { CSSModuleExports } from './transformers/postcss/types.js';

export type Transformer<Options> = (
	code: string,
	id: string,
	options: Options,
) => {
	code: string;
	exports: CSSModuleExports;
	references: CSSModuleReferences;
};
