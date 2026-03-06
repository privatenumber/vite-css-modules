import postcssModulesValues from 'postcss-modules-values';
import postcssModulesLocalByDefault from 'postcss-modules-local-by-default';
import postcssModulesExtractImports from 'postcss-modules-extract-imports';
import postcssModulesScope from 'postcss-modules-scope';
import genericNames from 'generic-names';
import postcss from 'postcss';
import { p as postcssExtractIcss } from './postcss-extract-icss-CQKMl2eo.mjs';
import 'icss-utils';

const defaultScopedName = "_[local]_[hash:7]";
const transform = (code, id, options, generateSourceMap) => {
  const generateScopedName = typeof options.generateScopedName === "function" ? options.generateScopedName : genericNames(options.generateScopedName ?? defaultScopedName, {
    hashPrefix: options.hashPrefix
  });
  const isGlobal = options.globalModulePaths?.some((pattern) => pattern.test(id));
  const localClasses = [];
  let extracted;
  const processed = postcss([
    postcssModulesValues,
    postcssModulesLocalByDefault({
      mode: isGlobal ? "global" : options.scopeBehaviour
    }),
    // Declares imports from composes
    postcssModulesExtractImports(),
    // Resolves & removes composes
    postcssModulesScope({
      exportGlobals: options.exportGlobals,
      generateScopedName: (exportName, resourceFile, rawCss, _node) => {
        const scopedName = generateScopedName(
          exportName,
          resourceFile,
          rawCss
          /* _node */
        );
        localClasses.push(scopedName);
        return scopedName;
      }
    }),
    postcssExtractIcss({
      localClasses,
      onModuleExports: (_extracted) => {
        extracted = _extracted;
      }
    })
  ]).process(code, {
    from: id,
    map: generateSourceMap ? {
      inline: false,
      annotation: false,
      sourcesContent: true
    } : false
  });
  return {
    code: processed.css,
    map: processed.map?.toJSON(),
    // Note: postcss lazily proccesses when `.css` is accessed so this is undefined until then
    ...extracted
  };
};

export { transform };
