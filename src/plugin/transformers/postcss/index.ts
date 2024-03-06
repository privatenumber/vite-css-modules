import type { CSSModulesOptions } from 'vite';
import postcssModulesValues from 'postcss-modules-values';
import postcssModulesLocalByDefault from 'postcss-modules-local-by-default';
import postcssModulesExtractImports from 'postcss-modules-extract-imports';
import postcssModulesScope from 'postcss-modules-scope';
import genericNames from 'generic-names';
import postcss from 'postcss';
import type { ExistingRawSourceMap } from 'rollup';
import type { Transformer } from '../../types.js';
import { postcssExtractIcss } from './postcss-extract-icss.js';
import type { Extracted } from './types.js';

/**
 * For reference, postcss-modules's default:
 * https://github.com/madyankin/postcss-modules/blob/v6.0.0/src/scoping.js#L41
 *
 * I didn't add the line number because it seemed needless.
 * I increased the hash to 7 to follow Git's default for short SHA:
 * https://stackoverflow.com/a/18134919/911407
 *
 * FYI LightningCSS recommends hash first for grid compatibility,
 * https://github.com/parcel-bundler/lightningcss/blob/v1.23.0/website/pages/css-modules.md?plain=1#L237-L238
 *
 * but PostCSS CSS Modules doesn't seem to transform Grid names
 */
const defaultScopedName = '_[local]_[hash:7]';

export const transform: Transformer<CSSModulesOptions> = (
	code,
	id,
	options,
	generateSourceMap,
) => {
	const generateScopedName = (
		typeof options.generateScopedName === 'function'
			? options.generateScopedName
			: genericNames(options.generateScopedName ?? defaultScopedName, {
				hashPrefix: options.hashPrefix,
			})
	);

	const isGlobal = options.globalModulePaths?.some(pattern => pattern.test(id));
	const localClasses: string[] = [];
	let extracted: Extracted;
	const processed = postcss([
		postcssModulesValues,

		postcssModulesLocalByDefault({
			mode: isGlobal ? 'global' : options.scopeBehaviour,
		}),

		// Declares imports from composes
		postcssModulesExtractImports(),

		// Resolves & removes composes
		postcssModulesScope({
			exportGlobals: options.exportGlobals,
			generateScopedName: (
				exportName,
				resourceFile,
				rawCss,
				_node,
			) => {
				const scopedName = generateScopedName(exportName, resourceFile, rawCss /* _node */);
				localClasses.push(scopedName);
				return scopedName;
			},
		}),

		postcssExtractIcss({
			localClasses,
			onModuleExports: (_extracted) => {
				extracted = _extracted;
			},
		}),
	]).process(code, {
		from: id,
		map: (
			generateSourceMap
				? {
					inline: false,
					annotation: false,
					sourcesContent: true,
				}
				: false
		),
	});

	return {
		code: processed.css,
		map: processed.map?.toJSON() as unknown as ExistingRawSourceMap,
		...extracted!,
	};
};
