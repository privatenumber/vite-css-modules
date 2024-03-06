import type { CSSModuleReferences } from 'lightningcss';
import type { SourceMapInput } from 'rollup';
import type { CSSModuleExports } from './transformers/postcss/types.js';
import type { Exports } from './generate-esm.js';

export type Transformer<Options> = (
	code: string,
	id: string,
	options: Options,
	generateSourceMap?: boolean,
) => {
	code: string;
	map?: SourceMapInput;
	exports: CSSModuleExports;
	references: CSSModuleReferences;
};

export type PluginMeta = {
	css: string;
	exports: Exports;
};
