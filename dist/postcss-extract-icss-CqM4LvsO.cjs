'use strict';

var icssUtils = require('icss-utils');

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
    const { icssImports, icssExports } = icssUtils.extractICSS(root);
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

exports.postcssExtractIcss = postcssExtractIcss;
