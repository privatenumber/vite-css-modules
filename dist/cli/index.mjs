#!/usr/bin/env node
import { command, cli } from 'cleye';
import path, { resolve, isAbsolute, dirname, join } from 'node:path';
import { glob } from 'tinyglobby';
import { b as generateTypes, t as targetSupportsArbitraryModuleNamespace, g as getLocalesConventionFunction, a as shouldKeepOriginalExport } from '../supports-arbitrary-module-namespace-B0qmLoQs.mjs';
import fs from 'node:fs/promises';
import { transform } from '../index-CbClBqft.mjs';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import 'node:url';
import tty from 'node:tty';
import '@rollup/pluginutils';
import 'postcss-modules-values';
import 'postcss-modules-local-by-default';
import 'postcss-modules-extract-imports';
import 'postcss-modules-scope';
import 'generic-names';
import 'postcss';
import 'icss-utils';

function absolute(input, root) {
  return isAbsolute(input) ? input : resolve(root || ".", input);
}

function up$1(base, options) {
  let { last, cwd } = options || {};
  let tmp = absolute(base, cwd);
  let root = absolute(last || "/", cwd);
  let prev, arr = [];
  while (prev !== root) {
    arr.push(tmp);
    tmp = dirname(prev = tmp);
    if (tmp === prev) break;
  }
  return arr;
}

function up(name, options) {
  let dir2, tmp;
  let start = options && options.cwd || "";
  for (dir2 of up$1(start, options)) {
    tmp = join(dir2, name);
    if (existsSync(tmp)) return tmp;
  }
}

const sassCache = /* @__PURE__ */ new Map();
const tryImportSass = (packageJsonPath) => {
  const cached = sassCache.get(packageJsonPath);
  if (cached !== void 0) {
    return cached ?? void 0;
  }
  try {
    const require = createRequire(packageJsonPath);
    let compiler;
    try {
      compiler = require("sass-embedded");
    } catch {
      compiler = require("sass");
    }
    sassCache.set(packageJsonPath, compiler);
    return compiler;
  } catch {
    sassCache.set(packageJsonPath, null);
    return void 0;
  }
};
const stripScssComments = (code) => code.replaceAll(/^\s*\/\/.*$/gm, "");
const compileSass = (code, filePath, syntax) => {
  const packageJsonPath = up("package.json", { cwd: path.dirname(filePath) });
  const sass = packageJsonPath ? tryImportSass(packageJsonPath) : void 0;
  if (sass) {
    const absolutePath = path.resolve(filePath);
    const result = sass.compileString(code, {
      syntax,
      url: new URL(`file://${absolutePath}`),
      loadPaths: [path.dirname(absolutePath)]
    });
    return {
      code: result.css,
      sassNotFound: false
    };
  }
  return {
    code: stripScssComments(code),
    sassNotFound: true
  };
};

const preprocessorExtensions = /* @__PURE__ */ new Set([".scss", ".sass", ".less", ".styl", ".stylus"]);
const sassExtensions = /* @__PURE__ */ new Set([".scss", ".sass"]);
const processFile = async (file, options) => {
  const moduleExtension = file.match(/\.module\.(\w+)$/)?.[1] ?? "";
  const isSassFile = sassExtensions.has(`.${moduleExtension}`);
  let sassNotFound = false;
  try {
    let code = await fs.readFile(file, "utf8");
    if (isSassFile) {
      const result = compileSass(
        code,
        file,
        moduleExtension === "sass" ? "indented" : "scss"
      );
      code = result.code;
      sassNotFound = result.sassNotFound;
    }
    const { exports: cssExports } = transform(code, file, options.cssModulesOptions);
    const exportNames = Object.fromEntries(
      Object.entries(cssExports).map(([exportName, exported]) => {
        const exportAs = /* @__PURE__ */ new Set();
        if (options.keepOriginalExport) {
          exportAs.add(exportName);
        }
        const className = typeof exported === "string" ? exportName : exported.name;
        const transformedExport = options.localsConventionFunction?.(exportName, className, file);
        if (transformedExport) {
          exportAs.add(transformedExport);
        }
        return [exportName, {
          exportAs,
          code: "",
          resolved: ""
        }];
      })
    );
    const dtsContent = generateTypes(
      exportNames,
      options.exportMode,
      options.allowArbitraryNamedExports
    );
    const dtsPath = `${file}.d.ts`;
    await fs.writeFile(dtsPath, dtsContent, "utf8");
    return {
      file,
      dtsPath
    };
  } catch (error) {
    let errorType;
    if (sassNotFound) {
      errorType = "sass-not-found";
    } else if (preprocessorExtensions.has(`.${moduleExtension}`)) {
      errorType = "preprocessor";
    } else {
      errorType = "other";
    }
    return {
      file,
      error: error instanceof Error ? error.message : String(error),
      errorType
    };
  }
};

const hasColors = tty?.WriteStream?.prototype?.hasColors?.() ?? false;
const format = (open, close) => {
  if (!hasColors) {
    return (input) => input;
  }
  const openCode = `\x1B[${open}m`;
  const closeCode = `\x1B[${close}m`;
  return (input) => {
    const string = input + "";
    let index = string.indexOf(closeCode);
    if (index === -1) {
      return openCode + string + closeCode;
    }
    let result = openCode;
    let lastIndex = 0;
    const reopenOnNestedClose = close === 22;
    const replaceCode = (reopenOnNestedClose ? closeCode : "") + openCode;
    while (index !== -1) {
      result += string.slice(lastIndex, index) + replaceCode;
      lastIndex = index + closeCode.length;
      index = string.indexOf(closeCode, lastIndex);
    }
    result += string.slice(lastIndex) + closeCode;
    return result;
  };
};
const red = format(31, 39);
const green = format(32, 39);
const yellow = format(33, 39);

const successIcon = green("\u2714");
const failureIcon = red("\u2716");
const warningIcon = yellow("\u26A0");
const reportResults = (results, totalFiles) => {
  for (const result of results) {
    if ("dtsPath" in result) {
      console.log(result.dtsPath);
    }
  }
  const failedFiles = results.filter((r) => "error" in r);
  if (failedFiles.length > 0) {
    const sassNotFoundFailures = failedFiles.filter((f) => f.errorType === "sass-not-found");
    const preprocessorFailures = failedFiles.filter((f) => f.errorType === "preprocessor");
    const otherFailures = failedFiles.filter((f) => f.errorType === "other");
    console.error(`
${failureIcon} Failed to generate types for ${failedFiles.length.toLocaleString()} file(s)`);
    process.exitCode = 1;
    if (sassNotFoundFailures.length > 0) {
      console.error(`
${warningIcon} ${sassNotFoundFailures.length.toLocaleString()} file(s) missing sass compiler:`);
      for (const { file, error } of sassNotFoundFailures) {
        console.error(`  - ${file}`);
        console.error(`    ${error}`);
      }
      console.error("\n  Install `sass` or `sass-embedded` in the package containing these files.");
    }
    if (preprocessorFailures.length > 0) {
      console.error(`
${warningIcon} ${preprocessorFailures.length.toLocaleString()} file(s) with preprocessor syntax errors:`);
      for (const { file, error } of preprocessorFailures) {
        console.error(`  - ${file}`);
        console.error(`    ${error}`);
      }
      console.error("\n  These files may use syntax that failed to compile (e.g. invalid SCSS).");
    }
    if (otherFailures.length > 0) {
      console.error(`
${otherFailures.length.toLocaleString()} file(s) with other errors:`);
      for (const { file, error } of otherFailures) {
        console.error(`  - ${file}`);
        console.error(`    ${error}`);
      }
    }
  } else {
    console.log(`
${successIcon} Successfully generated types for ${totalFiles.toLocaleString()} CSS Module(s)`);
  }
};

const exportModes = ["both", "named", "default"];
const localsConventions = ["camelCase", "camelCaseOnly", "dashes", "dashesOnly"];
const generateTypesCommand = command({
  name: "generate-types",
  parameters: [
    "[directories...]"
  ],
  flags: {
    exportMode: {
      type: String,
      alias: "e",
      description: `Export style: ${exportModes.join(", ")} (default: both)`
    },
    localsConvention: {
      type: String,
      alias: "l",
      description: `Class name transformation: ${localsConventions.join(", ")}`
    },
    target: {
      type: String,
      description: "Build target for arbitrary module namespace (e.g. es2022, esnext, chrome90)"
    }
  },
  help: {
    description: "Generate TypeScript declaration files for CSS Modules"
  }
}, async (argv) => {
  const directories = argv._.directories && argv._.directories.length > 0 ? argv._.directories : [process.cwd()];
  const { exportMode, localsConvention, target } = argv.flags;
  if (exportMode && !exportModes.includes(exportMode)) {
    throw new Error(`Invalid --export-mode: ${exportMode}. Must be one of: ${exportModes.join(", ")}`);
  }
  if (localsConvention && !localsConventions.includes(localsConvention)) {
    throw new Error(`Invalid --locals-convention: ${localsConvention}. Must be one of: ${localsConventions.join(", ")}`);
  }
  const files = await glob(
    directories.map(
      (directory) => path.posix.join(directory, "**/*.module.{css,scss,sass,less,styl,stylus,pcss,postcss}")
    ),
    {
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
        "**/coverage/**"
      ]
    }
  );
  if (files.length === 0) {
    console.log("No CSS Modules found");
    return;
  }
  files.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  console.log(`Found ${files.length.toLocaleString()} CSS Module(s)
`);
  const validatedExportMode = exportMode ?? "both";
  const validatedLocalsConvention = localsConvention;
  const cssModulesOptions = validatedLocalsConvention ? { localsConvention: validatedLocalsConvention } : {};
  const keepOriginalExport = shouldKeepOriginalExport(cssModulesOptions);
  const localsConventionFunction = getLocalesConventionFunction(cssModulesOptions);
  const allowArbitraryNamedExports = target ? targetSupportsArbitraryModuleNamespace(target) : false;
  const results = await Promise.all(
    files.map((file) => processFile(file, {
      exportMode: validatedExportMode,
      keepOriginalExport,
      localsConventionFunction,
      allowArbitraryNamedExports,
      cssModulesOptions
    }))
  );
  reportResults(results, files.length);
});

cli({
  name: "vite-css-modules",
  commands: [
    generateTypesCommand
  ]
}, () => {
  throw new Error("No command specified. Run with --help to see available commands.");
}).catch((error) => {
  console.error("Error:", error.message);
  process.exitCode = 1;
});
