#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { cli } from 'cleye';
import { glob } from 'tinyglobby';
import { b as shouldKeepOriginalExport, d as getLocalesConventionFunction, a as cleanUrl, g as getCssModuleUrl, s as slash, e as generateTypes, w as writeTypeFiles } from '../generate-types-BvRxwusA.mjs';
import { cssClassPositions } from 'css-class-positions';
import { preprocessCSS, loadConfigFromFile, createLogger, resolveConfig } from 'vite';
import { transform as transform$1 } from '../index-BKVAQCWi.mjs';
import { transform } from '../lightningcss-BOs8XuUi.mjs';
import { getTsconfig } from 'get-tsconfig';
import '@rollup/pluginutils';
import '@jridgewell/sourcemap-codec';
import 'postcss-modules-values';
import 'postcss-modules-local-by-default';
import 'postcss-modules-extract-imports';
import 'postcss-modules-scope';
import 'generic-names';
import 'postcss';
import 'icss-utils';
import 'lightningcss';

const cssModuleExportsToExports = (cssModuleExports, filePath, keepOriginalExport, localsConventionFunction, resolveComposition) => {
  const exports$1 = {};
  const resolving = /* @__PURE__ */ new Set();
  const resolveExport = (exportName) => {
    const existing = exports$1[exportName];
    if (existing) {
      return existing;
    }
    const exported = cssModuleExports[exportName];
    if (!exported) {
      return;
    }
    if (resolving.has(exportName)) {
      return;
    }
    resolving.add(exportName);
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
      const composedNames = exported.composes.map((composition) => {
        if (composition.type === "local") {
          return resolveExport(composition.name)?.resolved ?? composition.name;
        }
        return resolveComposition?.(composition) ?? composition.name;
      });
      resolved = [exported.name, ...composedNames].join(" ");
    }
    exports$1[exportName] = {
      code: resolved,
      resolved,
      exportAs
    };
    resolving.delete(exportName);
    return exports$1[exportName];
  };
  for (const exportName of Object.keys(cssModuleExports)) {
    resolveExport(exportName);
  }
  return exports$1;
};

const createCssModuleLoader = (context) => {
  const cache = /* @__PURE__ */ new Map();
  const keepOriginalExport = shouldKeepOriginalExport(context.cssModulesConfig);
  const localsConventionFunction = getLocalesConventionFunction(context.cssModulesConfig);
  const resolve = context.resolvedConfig.createResolver();
  const resolveDependency = async (specifier, fromFile) => {
    const resolved = await resolve(getCssModuleUrl(specifier), fromFile);
    if (!resolved) {
      throw new Error(`Cannot resolve ${JSON.stringify(specifier)} from ${JSON.stringify(fromFile)}`);
    }
    return cleanUrl(resolved).split("?", 2)[0];
  };
  const loadCssModule = async (filePath, includeSourceMap = false, sourceCode) => {
    let cached = cache.get(filePath);
    if (!cached) {
      cached = (async () => {
        const code = sourceCode ?? await fs.readFile(filePath, "utf8");
        const processed = await preprocessCSS(
          code,
          filePath.replace(/\.module(?=\.)/, ""),
          context.resolvedConfig
        );
        const id = cleanUrl(path.relative(context.resolvedConfig.root, filePath));
        const cssModule2 = context.resolvedConfig.css.transformer === "lightningcss" ? transform(
          processed.code,
          id,
          context.resolvedConfig.css.lightningcss ?? {},
          false
        ) : transform$1(
          processed.code,
          id,
          context.cssModulesConfig,
          false
        );
        const resolvedDependencies = /* @__PURE__ */ new Map();
        for (const exported of Object.values(cssModule2.exports)) {
          if (typeof exported === "string") {
            continue;
          }
          for (const composed of exported.composes) {
            if (composed.type !== "dependency") {
              continue;
            }
            const dependencyFile = await resolveDependency(composed.specifier, filePath);
            const dependencyModule = await loadCssModule(dependencyFile);
            const dependencyExport = dependencyModule.exports[composed.name];
            if (!dependencyExport) {
              throw new Error(`Cannot resolve ${JSON.stringify(composed.name)} from ${JSON.stringify(composed.specifier)}`);
            }
            resolvedDependencies.set(
              `${composed.specifier}\0${composed.name}`,
              dependencyExport.resolved
            );
          }
        }
        for (const reference of Object.values(cssModule2.references)) {
          const dependencyFile = await resolveDependency(reference.specifier, filePath);
          const dependencyModule = await loadCssModule(dependencyFile);
          if (!dependencyModule.exports[reference.name]) {
            throw new Error(`Cannot resolve ${JSON.stringify(reference.name)} from ${JSON.stringify(reference.specifier)}`);
          }
        }
        return {
          exports: cssModuleExportsToExports(
            cssModule2.exports,
            filePath,
            keepOriginalExport,
            localsConventionFunction,
            (composition) => composition.type === "dependency" ? resolvedDependencies.get(`${composition.specifier}\0${composition.name}`) : composition.name
          ),
          originalCode: code
        };
      })();
      cache.set(filePath, cached);
    }
    const cssModule = await cached;
    const sourceMapOptions = includeSourceMap && context.declarationMap ? {
      sourceFileName: path.basename(filePath),
      classPositions: cssClassPositions(cssModule.originalCode, { fileName: filePath })
    } : void 0;
    return {
      exports: cssModule.exports,
      sourceMapOptions
    };
  };
  return loadCssModule;
};

const formatDebugPath = (filePath, cwd = process.cwd()) => {
  if (!path.isAbsolute(filePath)) {
    return slash(filePath);
  }
  const relativePath = path.relative(cwd, filePath);
  return slash(relativePath || ".");
};

const viteConfigNames = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.cts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs"
];
const findViteConfigInDirectory = async (directoryPath) => {
  for (const configName of viteConfigNames) {
    const configPath = path.join(directoryPath, configName);
    const configExists = await fs.access(configPath).then(() => true, () => false);
    if (configExists) {
      return configPath;
    }
  }
};
const sanitizeUserConfig = (configPath, userConfig, options) => {
  const configDirectory = path.dirname(configPath);
  return {
    configFile: false,
    root: typeof userConfig.root === "string" ? path.resolve(configDirectory, userConfig.root) : process.cwd(),
    mode: options.mode,
    plugins: [],
    resolve: userConfig.resolve ? {
      alias: userConfig.resolve.alias
    } : void 0,
    css: userConfig.css ? {
      transformer: userConfig.css?.transformer,
      modules: false,
      preprocessorOptions: userConfig.css?.preprocessorOptions,
      postcss: userConfig.css?.postcss,
      lightningcss: userConfig.css?.lightningcss ? {
        ...userConfig.css.lightningcss,
        cssModules: false
      } : void 0
    } : void 0
  };
};
const loadProjectContext = async (options) => {
  const loadedConfig = await loadConfigFromFile(
    {
      command: "serve",
      mode: options.mode
    },
    options.configPath,
    path.dirname(options.configPath),
    "silent",
    createLogger("silent"),
    "bundle"
  );
  if (!loadedConfig) {
    throw new Error(`Could not load Vite config: ${options.configPath}`);
  }
  const resolvedConfig = await resolveConfig(
    sanitizeUserConfig(options.configPath, loadedConfig.config, options),
    "serve",
    options.mode,
    void 0,
    false
  );
  const declarationMap = Boolean(
    getTsconfig(resolvedConfig.root)?.config.compilerOptions?.declarationMap
  );
  const cssModulesConfig = {
    ...loadedConfig.config.css?.modules
  };
  return {
    cssModulesConfig,
    declarationMap,
    resolvedConfig
  };
};

const defaultGlob = "**/*.module.{css,scss,sass}";
const isPathOutsideRoot = (root, filePath) => {
  const relativePath = path.relative(root, filePath);
  return relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath);
};
(async () => {
  const argv = cli({
    name: "vite-css-modules",
    parameters: [
      "[globs...]"
    ],
    flags: {
      config: {
        type: String,
        description: "Path to vite config file"
      },
      mode: {
        type: String,
        description: "Vite mode",
        default: "development"
      }
    }
  });
  const cwd = process.cwd();
  const { globs: inputGlobs = [] } = argv._;
  const { config, mode } = argv.flags;
  const usingDefaultGlob = inputGlobs.length === 0;
  const configPath = config ? path.resolve(config) : await findViteConfigInDirectory(cwd);
  if (!configPath) {
    console.error(`No vite.config.* found in the current working directory: ${cwd}`);
    console.error("Run this command from the same cwd as Vite, or pass --config.");
    process.exitCode = 1;
    return;
  }
  const projectContext = await loadProjectContext({
    configPath,
    mode
  });
  const { root } = projectContext.resolvedConfig;
  let globs = inputGlobs;
  let globCwd = cwd;
  if (usingDefaultGlob) {
    if (isPathOutsideRoot(cwd, root)) {
      console.error(`Resolved Vite root is outside the current working directory: ${root}`);
      console.error("Pass explicit globs to control the search scope.");
      process.exitCode = 1;
      return;
    }
    globs = [defaultGlob];
    globCwd = root;
  }
  const files = await glob(globs, {
    absolute: true,
    cwd: globCwd,
    ignore: ["**/node_modules/**"]
  });
  if (files.length === 0) {
    console.error("No files matched the provided glob patterns");
    return;
  }
  const loadCssModule = createCssModuleLoader(projectContext);
  for (const filePath of files) {
    try {
      const sourceCode = await fs.readFile(filePath, "utf8");
      const {
        exports: exports$1,
        sourceMapOptions
      } = await loadCssModule(filePath, true, sourceCode);
      const generatedDts = generateTypes(
        exports$1,
        "both",
        false,
        sourceMapOptions
      );
      const outputPaths = await writeTypeFiles(`${filePath}.d.ts`, generatedDts, "external");
      for (const outputPath of outputPaths) {
        console.log(`\u2713 ${formatDebugPath(outputPath, cwd)}`);
      }
    } catch (error) {
      console.error(`\u2717 ${formatDebugPath(filePath, cwd)}`);
      console.error(`  ${error.message}`);
      process.exitCode = 1;
    }
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
