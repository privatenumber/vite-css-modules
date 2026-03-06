'use strict';

var postcssModulesValues = require('postcss-modules-values');
var postcssModulesLocalByDefault = require('postcss-modules-local-by-default');
var postcssModulesExtractImports = require('postcss-modules-extract-imports');
var postcssModulesScope = require('postcss-modules-scope');
var genericNames = require('generic-names');
var postcss = require('postcss');
var postcssExtractIcss = require('./postcss-extract-icss-CqM4LvsO.cjs');
require('icss-utils');

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
    postcssExtractIcss.postcssExtractIcss({
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

exports.transform = transform;
