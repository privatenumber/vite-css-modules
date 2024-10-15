import postcssModulesValues from 'postcss-modules-values';
import postcssModulesLocalByDefault from 'postcss-modules-local-by-default';
import postcssModulesExtractImports from 'postcss-modules-extract-imports';
import postcssModulesScope from 'postcss-modules-scope';
import genericNames from 'generic-names';
import postcss from 'postcss';
import { extractICSS } from 'icss-utils';

const processExracted = (icssExports, dependencies, localClasses) => {
  const exports = {};
  const references = {};
  for (const [exportedAs, value] of Object.entries(icssExports)) {
    const hasLocalClass = localClasses.some((localClass) => value.includes(localClass));
    if (hasLocalClass) {
      const [firstClass, ...composed] = value.split(" ");
      exports[exportedAs] = {
        name: firstClass,
        composes: composed.map((className) => {
          if (localClasses.includes(className)) {
            return {
              type: "local",
              name: className
            };
          }
          if (dependencies.has(className)) {
            return dependencies.get(className);
          }
          return {
            type: "global",
            name: className
          };
        })
      };
    } else if (dependencies.has(value)) {
      references[value] = dependencies.get(value);
    } else {
      exports[exportedAs] = value;
    }
  }
  return {
    exports,
    references
  };
};
const postcssExtractIcss = (options) => ({
  postcssPlugin: "extract-icss",
  OnceExit: (root) => {
    const { icssImports, icssExports } = extractICSS(root);
    const dependencies = new Map(
      Object.entries(icssImports).flatMap(
        ([filePath, fileImports]) => Object.entries(fileImports).map(([hash, name]) => [
          hash,
          Object.freeze({
            type: "dependency",
            name,
            specifier: filePath
          })
        ])
      )
    );
    const extracted = processExracted(
      icssExports,
      dependencies,
      options.localClasses
    );
    options.onModuleExports(extracted);
  }
});
postcssExtractIcss.postcss = true;

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
    ...extracted
  };
};

export { transform };
