#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { transform } from '../index-BKVAQCWi.mjs';
import { a as generateTypes, s as shouldKeepOriginalExport, g as getLocalesConventionFunction } from '../generate-types-ECgGOd59.mjs';
import 'postcss-modules-values';
import 'postcss-modules-local-by-default';
import 'postcss-modules-extract-imports';
import 'postcss-modules-scope';
import 'generic-names';
import 'postcss';
import 'icss-utils';
import '@rollup/pluginutils';
import 'postcss-selector-parser';
import '@jridgewell/sourcemap-codec';

const cssModuleExportsToExports = (cssModuleExports, filePath, keepOriginalExport, localsConventionFunction) => {
  const exports$1 = {};
  for (const [exportName, exported] of Object.entries(cssModuleExports)) {
    const exportAs = /* @__PURE__ */ new Set();
    if (keepOriginalExport) {
      exportAs.add(exportName);
    }
    let resolved;
    if (typeof exported === "string") {
      const transformedExport = localsConventionFunction?.(exportName, exportName, filePath);
      if (transformedExport) {
        exportAs.add(transformedExport);
      }
      resolved = exported;
    } else {
      const transformedExport = localsConventionFunction?.(exportName, exported.name, filePath);
      if (transformedExport) {
        exportAs.add(transformedExport);
      }
      const composedNames = exported.composes.map((dep) => dep.name);
      resolved = [exported.name, ...composedNames].join(" ");
    }
    exports$1[exportName] = {
      code: resolved,
      resolved,
      exportAs
    };
  }
  return exports$1;
};

const exportModes = ["both", "named", "default"];
const ExportModeType = (value) => {
  if (!exportModes.includes(value)) {
    throw new Error(`Invalid export mode: ${value}. Must be one of: ${exportModes.join(", ")}`);
  }
  return value;
};
const localsConventions = ["camelCase", "camelCaseOnly", "dashes", "dashesOnly"];
const LocalsConventionType = (value) => {
  if (!localsConventions.includes(value)) {
    throw new Error(`Invalid locals convention: ${value}. Must be one of: ${localsConventions.join(", ")}`);
  }
  return value;
};
(async () => {
  const argv = cli({
    name: "vite-css-modules",
    parameters: [
      "<globs...>"
    ],
    flags: {
      exportMode: {
        type: ExportModeType,
        alias: "e",
        description: `Export mode: ${exportModes.join(", ")}`,
        default: ExportModeType("both")
      },
      localsConvention: {
        type: LocalsConventionType,
        alias: "l",
        description: `Locals convention: ${localsConventions.join(", ")}`
      },
      arbitraryExports: {
        type: Boolean,
        description: "Allow arbitrary module namespace exports (ES2022+)",
        default: false
      }
    }
  });
  const { exportMode, localsConvention } = argv.flags;
  const cssModulesConfig = localsConvention ? { localsConvention } : {};
  const keepOriginalExport = shouldKeepOriginalExport(cssModulesConfig);
  const localsConventionFunction = getLocalesConventionFunction(cssModulesConfig);
  const files = await glob(argv._.globs);
  if (files.length === 0) {
    console.error("No files matched the provided glob patterns");
    return;
  }
  const allowArbitraryNamedExports = argv.flags.arbitraryExports;
  await Promise.all(
    files.map(async (file) => {
      const filePath = path.resolve(file);
      try {
        const code = await fs.readFile(filePath, "utf8");
        const result = transform(code, filePath, {}, false);
        const exports$1 = cssModuleExportsToExports(
          result.exports,
          filePath,
          keepOriginalExport,
          localsConventionFunction
        );
        const dts = generateTypes(exports$1, exportMode, allowArbitraryNamedExports);
        await fs.writeFile(`${filePath}.d.ts`, dts);
        console.log(`\u2713 ${file}`);
      } catch (error) {
        console.error(`\u2717 ${file}`);
        console.error(`  ${error.message}`);
        process.exitCode = 1;
      }
    })
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
