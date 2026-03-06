import path from 'node:path';
import { access, readFile, writeFile } from 'fs/promises';
import { makeLegalIdentifier, createFilter } from '@rollup/pluginutils';
import MagicString from 'magic-string';
import remapping from '@jridgewell/remapping';
import { getTsconfig } from 'get-tsconfig';
import { s as shouldKeepOriginalExport, g as getLocalesConventionFunction, f as findClassPositions, a as generateTypes } from './generate-types-ECgGOd59.mjs';
import path$1 from 'path';
import 'postcss';
import 'postcss-selector-parser';
import '@jridgewell/sourcemap-codec';

const cssModuleRE = /\.module\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;
const moduleCssQuery = "?.module.css";
const cleanUrl = (url) => url.endsWith(moduleCssQuery) ? url.slice(0, -moduleCssQuery.length) : url;
const getCssModuleUrl = (url) => {
  if (cssModuleRE.test(url)) {
    return url;
  }
  return url + moduleCssQuery;
};

const importStatement = (specifier, source) => `import ${Array.isArray(specifier) ? `{${specifier.join(",")}}` : specifier} from${JSON.stringify(source)};`;
const importsToCode = (imports, exportMode, allowArbitraryNamedExports = false) => Array.from(imports).map(
  ([file, importedAs], index) => {
    const importFrom = getCssModuleUrl(file);
    if (!allowArbitraryNamedExports || exportMode !== "named") {
      const importDefault = `cssModule${index}`;
      return `${importStatement(importDefault, importFrom)}const {${Object.entries(importedAs).map(
        ([exportName, importAs]) => `${JSON.stringify(exportName)}: ${importAs}`
      ).join(",")}} = ${importDefault};`;
    }
    return importStatement(
      Object.entries(importedAs).map(
        ([exportName, importAs]) => `${JSON.stringify(exportName)} as ${importAs}`
      ),
      importFrom
    );
  }
).join("");
const exportsToCode = (exports$1, exportMode, allowArbitraryNamedExports = false) => {
  let code = "";
  const variables = /* @__PURE__ */ new Set();
  const exportedVariables = Object.entries(exports$1).flatMap(
    ([exportName, { exportAs, code: value }]) => {
      const jsVariable = makeLegalIdentifier(exportName);
      variables.add(`const ${jsVariable} = \`${value}\`;`);
      return Array.from(exportAs).map((exportAsName) => {
        const exportNameSafe = makeLegalIdentifier(exportAsName);
        if (exportAsName !== exportNameSafe) {
          exportAsName = JSON.stringify(exportAsName);
        }
        return [jsVariable, exportAsName];
      });
    }
  );
  code += Array.from(variables).join("");
  if (exportMode === "both" || exportMode === "named") {
    const namedExports = `export {${exportedVariables.map(
      ([jsVariable, exportName]) => {
        if (exportName === '"default"' && exportMode === "both") {
          return;
        }
        return jsVariable === exportName ? jsVariable : exportName[0] !== '"' || allowArbitraryNamedExports ? `${jsVariable} as ${exportName}` : "";
      }
    ).filter(Boolean).join(",")}};`;
    code += namedExports;
  }
  if (exportMode === "both" || exportMode === "default") {
    const defaultExports = `export default{${exportedVariables.map(
      ([jsVariable, exportName]) => jsVariable === exportName ? jsVariable : `${exportName}: ${jsVariable}`
    ).join(",")}}`;
    code += defaultExports;
  }
  return code;
};
const generateEsm = (imports, exports$1, exportMode, allowArbitraryNamedExports = false) => importsToCode(imports, exportMode, allowArbitraryNamedExports) + exportsToCode(exports$1, exportMode, allowArbitraryNamedExports);

const arbitraryModuleNamespaceNames = {
  // https://github.com/evanw/esbuild/blob/c809af050a74f022d9cf61c66e13365434542420/compat-table/src/index.ts#L392
  es: [2022],
  chrome: [90],
  node: [16],
  firefox: [87],
  safari: [14, 1],
  ios: [14, 5]
};
const targetPattern = /^(chrome|deno|edge|firefox|hermes|ie|ios|node|opera|rhino|safari|es)(\w+)/i;
const parseTarget = (target) => {
  const hasType = target.match(targetPattern);
  if (!hasType) {
    return;
  }
  const [, type, version] = hasType;
  return [
    type.toLowerCase(),
    version.split(".").map(Number)
  ];
};
const compareSemver = (semverA, semverB) => semverA[0] - semverB[0] || (semverA[1] || 0) - (semverB[1] || 0) || (semverA[2] || 0) - (semverB[2] || 0) || 0;
const supportsArbitraryModuleNamespace = ({ build: { target: targets } }) => Boolean(
  targets && (Array.isArray(targets) ? targets : [targets]).every((target) => {
    if (target === "esnext") {
      return true;
    }
    const hasType = parseTarget(target);
    if (!hasType) {
      return false;
    }
    const [type, version] = hasType;
    const addedInVersion = arbitraryModuleNamespaceNames[type];
    if (!addedInVersion) {
      return false;
    }
    return compareSemver(addedInVersion, version) <= 0;
  })
);

const pluginName = "vite:css-modules";
const loadExports = async (context, requestId, fromId) => {
  const resolved = await context.resolve(requestId, fromId);
  if (!resolved) {
    throw new Error(`Cannot resolve "${requestId}" from "${fromId}"`);
  }
  const loaded = await context.load({
    id: resolved.id
  });
  const pluginMeta = loaded.meta[pluginName];
  return pluginMeta.exports;
};
const cssModules = (config, patchConfig) => {
  const filter = createFilter(cssModuleRE);
  const allowArbitraryNamedExports = supportsArbitraryModuleNamespace(config);
  const cssConfig = config.css;
  const cssModuleConfig = { ...cssConfig.modules };
  const lightningCssOptions = { ...cssConfig.lightningcss };
  const { devSourcemap } = cssConfig;
  const isLightningCss = cssConfig.transformer === "lightningcss";
  const loadTransformer = isLightningCss ? import('./lightningcss-BOs8XuUi.mjs') : import('./index-BKVAQCWi.mjs');
  let transform;
  const exportMode = patchConfig?.exportMode ?? "both";
  const declarationMap = patchConfig?.declarationMap ?? getTsconfig(config.root)?.config.compilerOptions?.declarationMap ?? false;
  let isVitest = false;
  return {
    name: pluginName,
    buildStart: async () => {
      const transformer = await loadTransformer;
      transform = transformer.transform;
    },
    load: {
      // Fallback load from disk in case it can't be loaded by another plugin (e.g. vue)
      order: "post",
      /**
       * Hook filter to reduce JS/Rust communication overhead in Rolldown
       * Supported in Vite 6.3.0+ and Rollup 4.38.0+
       * Backwards-compatible: internal filter check remains for older versions
       */
      filter: {
        id: cssModuleRE
      },
      handler: async (id) => {
        if (!filter(id)) {
          return;
        }
        id = id.split("?", 2)[0];
        return await readFile(id, "utf8");
      }
    },
    transform: {
      /**
       * Hook filter to reduce JS/Rust communication overhead in Rolldown
       * Supported in Vite 6.3.0+ and Rollup 4.38.0+
       * Backwards-compatible: internal filter check remains for older versions
       */
      filter: {
        id: cssModuleRE
      },
      async handler(inputCss, id) {
        if (!filter(id)) {
          return;
        }
        if (inputCss === "") {
          if (!isVitest) {
            const checkVitest = config.plugins.some((plugin) => plugin.name === "vitest:css-disable");
            if (checkVitest) {
              isVitest = true;
            }
          }
          if (isVitest) {
            return {
              code: "export default {};",
              map: null
            };
          }
        }
        const cssModule = transform(
          inputCss,
          /**
           * Relative path from project root to get stable CSS modules hash
           * https://github.com/vitejs/vite/blob/57463fc53fedc8f29e05ef3726f156a6daf65a94/packages/vite/src/node/plugins/css.ts#L2690
           */
          cleanUrl(path.relative(config.root, id)),
          isLightningCss ? lightningCssOptions : cssModuleConfig,
          devSourcemap
        );
        let outputCss = cssModule.code;
        const imports = /* @__PURE__ */ new Map();
        let counter = 0;
        const keepOriginalExport = shouldKeepOriginalExport(cssModuleConfig);
        const localsConventionFunction = getLocalesConventionFunction(cssModuleConfig);
        const registerImport = (fromFile, exportName) => {
          let importFrom = imports.get(fromFile);
          if (!importFrom) {
            importFrom = {};
            imports.set(fromFile, importFrom);
          }
          if (!exportName) {
            return;
          }
          if (!importFrom[exportName]) {
            importFrom[exportName] = `_${counter}`;
            counter += 1;
          }
          return importFrom[exportName];
        };
        const exportEntries = await Promise.all(
          Object.entries(cssModule.exports).map(async ([exportName, exported]) => {
            if (exportName === "default" && exportMode === "both") {
              this.warn('With `exportMode: both`, you cannot use "default" as a class name as it conflicts with the default export. Set `exportMode` to `default` or `named` to use "default" as a class name.');
            }
            const exportAs = /* @__PURE__ */ new Set();
            if (keepOriginalExport) {
              exportAs.add(exportName);
            }
            let code;
            let resolved;
            if (typeof exported === "string") {
              const transformedExport = localsConventionFunction?.(exportName, exportName, id);
              if (transformedExport) {
                exportAs.add(transformedExport);
              }
              code = exported;
              resolved = exported;
            } else {
              const transformedExport = localsConventionFunction?.(exportName, exported.name, id);
              if (transformedExport) {
                exportAs.add(transformedExport);
              }
              const composedClasses = await Promise.all(
                exported.composes.map(async (dep) => {
                  if (dep.type === "dependency") {
                    const loaded = await loadExports(this, getCssModuleUrl(dep.specifier), id);
                    const exportedEntry = loaded[dep.name];
                    if (!exportedEntry) {
                      throw new Error(`Cannot resolve ${JSON.stringify(dep.name)} from ${JSON.stringify(dep.specifier)}`);
                    }
                    const [exportAsName] = Array.from(exportedEntry.exportAs);
                    const importedAs = registerImport(dep.specifier, exportAsName);
                    return {
                      resolved: exportedEntry.resolved,
                      code: `\${${importedAs}}`
                    };
                  }
                  return {
                    resolved: dep.name,
                    code: dep.name
                  };
                })
              );
              code = [exported.name, ...composedClasses.map((c) => c.code)].join(" ");
              resolved = [exported.name, ...composedClasses.map((c) => c.resolved)].join(" ");
            }
            return [
              exportName,
              {
                code,
                resolved,
                exportAs
              }
            ];
          })
        );
        const exports$1 = Object.fromEntries(exportEntries);
        let { map } = cssModule;
        const references = Object.entries(cssModule.references);
        if (references.length > 0) {
          const ms = new MagicString(outputCss);
          await Promise.all(
            references.map(async ([placeholder, source]) => {
              const loaded = await loadExports(this, getCssModuleUrl(source.specifier), id);
              const exported = loaded[source.name];
              if (!exported) {
                throw new Error(`Cannot resolve "${source.name}" from "${source.specifier}"`);
              }
              registerImport(source.specifier);
              ms.replaceAll(placeholder, exported.code);
            })
          );
          outputCss = ms.toString();
          if (map) {
            const newMap = remapping(
              [
                ms.generateMap({
                  source: id,
                  file: id,
                  includeContent: true
                }),
                map
              ],
              () => null
            );
            map = newMap;
          }
        }
        if ("getJSON" in cssModuleConfig && typeof cssModuleConfig.getJSON === "function") {
          const json = {};
          for (const exported of Object.values(exports$1)) {
            for (const exportAs of exported.exportAs) {
              json[exportAs] = exported.resolved;
            }
          }
          cssModuleConfig.getJSON(id, json, id);
        }
        const jsCode = generateEsm(
          imports,
          exports$1,
          exportMode,
          allowArbitraryNamedExports
        );
        if (patchConfig?.generateSourceTypes) {
          const filePath = id.split("?", 2)[0];
          if (filePath && cssModuleRE.test(filePath)) {
            const fileExists = await access(filePath).then(() => true, () => false);
            if (fileExists) {
              const dtsPath = `${filePath}.d.ts`;
              const sourceMapOptions = declarationMap ? {
                sourceFileName: path.basename(filePath),
                classPositions: findClassPositions(inputCss, filePath)
              } : void 0;
              const newContent = generateTypes(
                exports$1,
                exportMode,
                allowArbitraryNamedExports,
                sourceMapOptions
              );
              const existingContent = await readFile(dtsPath, "utf8").catch(() => null);
              if (existingContent !== newContent) {
                await writeFile(dtsPath, newContent);
              }
            }
          }
        }
        return {
          code: jsCode,
          map: map ?? { mappings: "" },
          meta: {
            [pluginName]: {
              css: outputCss,
              exports: exports$1
            }
          }
        };
      }
    }
  };
};

const directRequestRE = /[?&]direct\b/;
const inlineRE = /[?&]inline\b/;
const CSS_LANGS_RE = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;
const isDirectCSSRequest = (request) => CSS_LANGS_RE.test(request) && directRequestRE.test(request);
const appendInlineSoureMap = (map) => {
  if (typeof map !== "string") {
    map = JSON.stringify(map);
  }
  const sourceMapUrl = `data:application/json;base64,${Buffer.from(map).toString("base64")}`;
  return `
/*# sourceMappingURL=${sourceMapUrl} */`;
};
const createTransformWrapper = (originalTransform, newTransform) => function() {
  return Reflect.apply(newTransform, this, [originalTransform, ...arguments]);
};
const patchTransform = (plugin, newTransform) => {
  if (!plugin.transform) {
    throw new Error("Plugin does not have a transform method");
  }
  if (typeof plugin.transform === "object" && "handler" in plugin.transform) {
    plugin.transform.handler = createTransformWrapper(plugin.transform.handler, newTransform);
  } else {
    plugin.transform = createTransformWrapper(plugin.transform, newTransform);
  }
};
const supportNewCssModules = (viteCssPostPlugin, config, pluginInstance) => {
  patchTransform(viteCssPostPlugin, async function(originalTransform, jsCode, id, options) {
    if (cssModuleRE.test(id)) {
      this.addWatchFile(path$1.resolve(id));
      const inlined = inlineRE.test(id);
      const info = this.getModuleInfo(id);
      const pluginMeta = info.meta[pluginInstance.name];
      if (!pluginMeta) {
        return Reflect.apply(originalTransform, this, [jsCode, id, options]);
      }
      let { css } = pluginMeta;
      if (config.command === "serve") {
        if (isDirectCSSRequest(id)) {
          return css;
        }
        if (options?.ssr) {
          return jsCode || `export default ${JSON.stringify(css)}`;
        }
        if (inlined) {
          return `export default ${JSON.stringify(css)}`;
        }
        if (config.css?.devSourcemap) {
          const map = this.getCombinedSourcemap();
          css += appendInlineSoureMap(map);
        }
        const code = [
          `import { updateStyle as __vite__updateStyle, removeStyle as __vite__removeStyle } from ${JSON.stringify(path$1.posix.join(config.base, "/@vite/client"))}`,
          `const __vite__id = ${JSON.stringify(id)}`,
          `const __vite__css = ${JSON.stringify(css)}`,
          "__vite__updateStyle(__vite__id, __vite__css)",
          // css modules exports change on edit so it can't self accept
          `${jsCode}`,
          "import.meta.hot.prune(() => __vite__removeStyle(__vite__id))"
        ].join("\n");
        return {
          code,
          map: { mappings: "" }
        };
      }
      const result = await Reflect.apply(originalTransform, this, [css, id]);
      if (inlined) {
        return result;
      }
      return {
        code: jsCode,
        map: { mappings: "" },
        moduleSideEffects: "no-treeshake"
      };
    }
    return Reflect.apply(originalTransform, this, [jsCode, id, options]);
  });
};
const supportCssModulesHMR = (vitePlugins) => {
  const viteCssAnalysisPlugin = vitePlugins.find((plugin) => plugin.name === "vite:css-analysis");
  if (!viteCssAnalysisPlugin) {
    return;
  }
  const { configureServer } = viteCssAnalysisPlugin;
  const tag = "?vite-css-modules?inline";
  viteCssAnalysisPlugin.configureServer = function(server) {
    const moduleGraph = server.environments ? server.environments.client.moduleGraph : server.moduleGraph;
    const { getModuleById } = moduleGraph;
    moduleGraph.getModuleById = function(id) {
      const tagIndex = id.indexOf(tag);
      if (tagIndex !== -1) {
        id = id.slice(0, tagIndex) + id.slice(tagIndex + tag.length);
      }
      return Reflect.apply(getModuleById, this, [id]);
    };
    if (configureServer) {
      return Reflect.apply(configureServer, this, [server]);
    }
  };
  patchTransform(viteCssAnalysisPlugin, async function(originalTransform, css, id, options) {
    if (cssModuleRE.test(id)) {
      id += tag;
    }
    return Reflect.apply(originalTransform, this, [css, id, options]);
  });
};
const patchCssModules = (patchConfig) => ({
  name: "patch-css-modules",
  enforce: "pre",
  configResolved: (config) => {
    const pluginInstance = cssModules(config, patchConfig);
    const cssConfig = config.css;
    const isCssModulesDisabled = (cssConfig.transformer === "lightningcss" ? cssConfig.lightningcss?.cssModules : cssConfig.modules) === false;
    if (isCssModulesDisabled) {
      return;
    }
    if (cssConfig.transformer === "lightningcss") {
      if (cssConfig.lightningcss) {
        cssConfig.lightningcss.cssModules = false;
      }
      cssConfig.transformer = "postcss";
    }
    cssConfig.modules = false;
    const viteCssPostPluginIndex = config.plugins.findIndex((plugin) => plugin.name === "vite:css-post");
    if (viteCssPostPluginIndex === -1) {
      throw new Error("vite:css-post plugin not found");
    }
    const viteCssPostPlugin = config.plugins[viteCssPostPluginIndex];
    config.plugins.splice(
      viteCssPostPluginIndex,
      0,
      pluginInstance
    );
    supportNewCssModules(
      viteCssPostPlugin,
      config,
      pluginInstance
    );
    supportCssModulesHMR(config.plugins);
  }
});

export { cssModules, patchCssModules, pluginName };
