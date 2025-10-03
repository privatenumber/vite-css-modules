'use strict';

var lightningcss = require('lightningcss');

const transform = (code, id, options, generateSourceMap) => {
  const transformed = lightningcss.transform({
    ...options,
    filename: id,
    code: Buffer.from(code),
    cssModules: options.cssModules || true,
    sourceMap: generateSourceMap
  });
  const exports = Object.fromEntries(
    Object.entries(
      // `exports` is defined if cssModules is true
      transformed.exports
    ).sort(
      // Cheap alphabetical sort (localCompare is expensive)
      ([a], [b]) => a < b ? -1 : a > b ? 1 : 0
    )
  );
  const map = transformed.map ? JSON.parse(Buffer.from(transformed.map).toString()) : void 0;
  return {
    code: transformed.code.toString(),
    map,
    exports,
    // If `dashedIdents` is enabled
    // https://github.com/parcel-bundler/lightningcss/blob/v1.23.0/node/index.d.ts#L288-L289
    references: transformed.references
  };
};

exports.transform = transform;
