'use strict';

var lightningcss = require('lightningcss');

const transform = (code, id, config, options) => {
  const transformed = lightningcss.transform({
    ...options,
    filename: id,
    code: Buffer.from(code),
    cssModules: config || true
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
  return {
    code: transformed.code.toString(),
    exports,
    // If `dashedIdents` is enabled
    // https://github.com/parcel-bundler/lightningcss/blob/v1.23.0/node/index.d.ts#L288-L289
    references: transformed.references
  };
};

exports.transform = transform;
