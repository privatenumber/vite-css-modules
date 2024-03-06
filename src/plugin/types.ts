import type { CSSModuleReferences } from 'lightningcss';
import type { SourceMapInput } from 'rollup';
import type { CSSModuleExports } from './transformers/postcss/types.js';

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
