#!/usr/bin/env node
'use strict';

var cleye = require('cleye');
var fs = require('node:fs/promises');
var path = require('node:path');
var tinyglobby = require('tinyglobby');
var getViteConfig = require('../get-vite-config-DMlO1c4D.cjs');
var index = require('../index-DM2PwZFQ.cjs');
require('@rollup/pluginutils');
require('vite');
require('postcss-modules-values');
require('postcss-modules-local-by-default');
require('postcss-modules-extract-imports');
require('postcss-modules-scope');
require('generic-names');
require('postcss');
require('icss-utils');

const viteConfigNames = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
  "vite.config.cts"
];
const findClosestViteConfig = async (filePath, knownConfigRoots) => {
  const absolutePath = path.resolve(filePath);
  let currentDirectory = path.dirname(absolutePath);
  const { root } = path.parse(currentDirectory);
  while (currentDirectory !== root) {
    if (knownConfigRoots.has(currentDirectory)) {
      return currentDirectory;
    }
    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    currentDirectory = parentDirectory;
  }
  currentDirectory = path.dirname(absolutePath);
  while (currentDirectory !== root) {
    for (const configName of viteConfigNames) {
      const configPath = path.join(currentDirectory, configName);
      try {
        await fs.access(configPath);
        return currentDirectory;
      } catch {
      }
    }
    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    currentDirectory = parentDirectory;
  }
  return void 0;
};
const generateTypesCommand = async (directories) => {
  const files = await tinyglobby.glob(
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
  console.log(`Found ${files.length} CSS Module(s)`);
  const configCache = /* @__PURE__ */ new Map();
  const getConfigForFile = async (file) => {
    const configRoot = await findClosestViteConfig(file, configCache);
    if (!configRoot) {
      return void 0;
    }
    let cached = configCache.get(configRoot);
    if (cached) {
      return cached;
    }
    const { viteConfig, pluginOptions } = await getViteConfig.getViteConfig(configRoot);
    if (pluginOptions.isCssModulesDisabled) {
      throw new Error(`CSS Modules is disabled in the Vite config at ${configRoot}`);
    }
    if (!pluginOptions.generateSourceTypes) {
      throw new Error(`generateSourceTypes must be enabled in vite-css-modules config at ${configRoot}`);
    }
    cached = {
      configRoot,
      viteConfig,
      pluginOptions,
      allowArbitraryNamedExports: getViteConfig.supportsArbitraryModuleNamespace(viteConfig),
      cssModulesOptions: pluginOptions.cssModulesOptions || {}
    };
    configCache.set(configRoot, cached);
    return cached;
  };
  await Promise.all(
    files.map(async (file) => {
      try {
        const config = await getConfigForFile(file);
        if (!config) {
          throw new Error("No Vite config found");
        }
        const code = await fs.readFile(file, "utf8");
        const { exports } = await index.transform(
          code,
          file,
          config.cssModulesOptions
        );
        const exportNames = Object.fromEntries(
          Object.keys(exports).map((exportedAs) => [exportedAs, {
            exportAs: /* @__PURE__ */ new Set([exportedAs]),
            // Unused
            code: "",
            resolved: ""
          }])
        );
        const dtsContent = getViteConfig.generateTypes(
          exportNames,
          config.pluginOptions.exportMode,
          config.allowArbitraryNamedExports
        );
        const dtsPath = `${file}.d.ts`;
        await fs.writeFile(dtsPath, dtsContent, "utf8");
        console.log(`\u2713 ${dtsPath}`);
      } catch (error) {
        console.error(`\u2717 ${file}`);
        console.error(`  ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    })
  );
  if (process.exitCode === 1) {
    console.error("\nFailed to generate types");
  } else {
    console.log(`
\u2713 Successfully generated types for ${files.length} CSS Module(s)`);
  }
};

const parsed = cleye.cli({
  name: "vite-css-modules",
  commands: [
    cleye.command({
      name: "generate-types",
      parameters: [
        "[directories...]"
      ],
      help: {
        description: "Generate TypeScript declaration files for CSS Modules"
      }
    }, async (argv) => {
      const directories = argv._.directories && argv._.directories.length > 0 ? argv._.directories : [process.cwd()];
      await generateTypesCommand(directories);
    })
  ]
});
if (parsed instanceof Promise) {
  parsed.catch((error) => {
    console.error("Error:", error.message);
    process.exitCode = 1;
  });
} else if (!parsed.command) {
  console.error("Error: No command specified. Run with --help to see available commands.");
  process.exitCode = 1;
}
