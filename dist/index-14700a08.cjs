'use strict';

var postcssModulesValues = require('postcss-modules-values');
var postcssModulesLocalByDefault = require('postcss-modules-local-by-default');
var postcssModulesExtractImports = require('postcss-modules-extract-imports');
var postcssModulesScope = require('postcss-modules-scope');
var genericNames = require('generic-names');
var postcss = require('postcss');
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

const defaultScopedName = "[name]_[local]_[hash:5]";
const transform = (code, from, options) => {
  const generateScopedName = typeof options?.generateScopedName === "function" ? options.generateScopedName : genericNames(options?.generateScopedName ?? defaultScopedName, {
    hashPrefix: options?.hashPrefix
  });
  const localClasses = [];
  let extracted;
  const { css } = postcss([
    postcssModulesValues,
    postcssModulesLocalByDefault({
      mode: options?.scopeBehaviour
    }),
    // Declares imports from composes
    postcssModulesExtractImports(),
    // Resolves & removes composes
    postcssModulesScope({
      exportGlobals: options?.exportGlobals,
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
  ]).process(code, { from });
  return {
    code: css,
    ...extracted
  };
};

exports.transform = transform;
