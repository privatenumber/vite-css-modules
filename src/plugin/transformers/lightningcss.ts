import {
	transform as lightningcssTransform,
	type CSSModulesConfig,
} from 'lightningcss';
import type { Transformer } from '../types.js';

export const transform: Transformer<CSSModulesConfig> = (
	code,
	id,
	config,
	options,
) => {
	const transformed = lightningcssTransform({
		...options,
		filename: id,
		code: Buffer.from(code),
		cssModules: config || true,
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

		exports,

		// If `dashedIdents` is enabled
		// https://github.com/parcel-bundler/lightningcss/blob/v1.23.0/node/index.d.ts#L288-L289
		references: transformed.references,
	};
};
