import { transform as lightningcssTransform } from 'lightningcss';
import type { LightningCSSOptions } from 'vite';

import type { Transformer } from '../types.js';

export const transform: Transformer<LightningCSSOptions> = (
	code,
	id,
	options,
	generateSourceMap,
) => {
	const transformed = lightningcssTransform({
		...options,
		filename: id,
		code: Buffer.from(code),
		cssModules: options.cssModules || true,
		sourceMap: generateSourceMap,
	});

	/**
	 * From Vite:
	 * https://github.com/vitejs/vite/blob/v5.0.12/packages/vite/src/node/plugins/css.ts#L2328
	 *
	 * Addresses non-deterministic exports order:
	 * https://github.com/parcel-bundler/lightningcss/issues/291
	 */
	const exports = Object.fromEntries(
		Object.entries(
			// `exports` is defined if cssModules is true
			transformed.exports!,
		).sort(
			// Cheap alphabetical sort (localCompare is expensive)
			([a], [b]) => (a < b ? -1 : (a > b ? 1 : 0)),
		),
	);

	return {
		code: transformed.code.toString(),
		map: transformed.map ? Buffer.from(transformed.map).toString() : undefined,

		exports,

		// If `dashedIdents` is enabled
		// https://github.com/parcel-bundler/lightningcss/blob/v1.23.0/node/index.d.ts#L288-L289
		references: transformed.references,
	};
};
