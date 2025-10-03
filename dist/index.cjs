'use strict';

var path = require('node:path');
var promises = require('fs/promises');
var pluginutils = require('@rollup/pluginutils');
var MagicString = require('magic-string');
var remapping = require('@jridgewell/remapping');
var path$1 = require('path');

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var lodash_camelcase;
var hasRequiredLodash_camelcase;

function requireLodash_camelcase () {
	if (hasRequiredLodash_camelcase) return lodash_camelcase;
	hasRequiredLodash_camelcase = 1;
	var symbolTag = "[object Symbol]";
	var reAsciiWord = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;
	var reLatin = /[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g;
	var rsAstralRange = "\\ud800-\\udfff", rsComboMarksRange = "\\u0300-\\u036f\\ufe20-\\ufe23", rsComboSymbolsRange = "\\u20d0-\\u20f0", rsDingbatRange = "\\u2700-\\u27bf", rsLowerRange = "a-z\\xdf-\\xf6\\xf8-\\xff", rsMathOpRange = "\\xac\\xb1\\xd7\\xf7", rsNonCharRange = "\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf", rsPunctuationRange = "\\u2000-\\u206f", rsSpaceRange = " \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000", rsUpperRange = "A-Z\\xc0-\\xd6\\xd8-\\xde", rsVarRange = "\\ufe0e\\ufe0f", rsBreakRange = rsMathOpRange + rsNonCharRange + rsPunctuationRange + rsSpaceRange;
	var rsApos = "['\u2019]", rsAstral = "[" + rsAstralRange + "]", rsBreak = "[" + rsBreakRange + "]", rsCombo = "[" + rsComboMarksRange + rsComboSymbolsRange + "]", rsDigits = "\\d+", rsDingbat = "[" + rsDingbatRange + "]", rsLower = "[" + rsLowerRange + "]", rsMisc = "[^" + rsAstralRange + rsBreakRange + rsDigits + rsDingbatRange + rsLowerRange + rsUpperRange + "]", rsFitz = "\\ud83c[\\udffb-\\udfff]", rsModifier = "(?:" + rsCombo + "|" + rsFitz + ")", rsNonAstral = "[^" + rsAstralRange + "]", rsRegional = "(?:\\ud83c[\\udde6-\\uddff]){2}", rsSurrPair = "[\\ud800-\\udbff][\\udc00-\\udfff]", rsUpper = "[" + rsUpperRange + "]", rsZWJ = "\\u200d";
	var rsLowerMisc = "(?:" + rsLower + "|" + rsMisc + ")", rsUpperMisc = "(?:" + rsUpper + "|" + rsMisc + ")", rsOptLowerContr = "(?:" + rsApos + "(?:d|ll|m|re|s|t|ve))?", rsOptUpperContr = "(?:" + rsApos + "(?:D|LL|M|RE|S|T|VE))?", reOptMod = rsModifier + "?", rsOptVar = "[" + rsVarRange + "]?", rsOptJoin = "(?:" + rsZWJ + "(?:" + [rsNonAstral, rsRegional, rsSurrPair].join("|") + ")" + rsOptVar + reOptMod + ")*", rsSeq = rsOptVar + reOptMod + rsOptJoin, rsEmoji = "(?:" + [rsDingbat, rsRegional, rsSurrPair].join("|") + ")" + rsSeq, rsSymbol = "(?:" + [rsNonAstral + rsCombo + "?", rsCombo, rsRegional, rsSurrPair, rsAstral].join("|") + ")";
	var reApos = RegExp(rsApos, "g");
	var reComboMark = RegExp(rsCombo, "g");
	var reUnicode = RegExp(rsFitz + "(?=" + rsFitz + ")|" + rsSymbol + rsSeq, "g");
	var reUnicodeWord = RegExp([
	  rsUpper + "?" + rsLower + "+" + rsOptLowerContr + "(?=" + [rsBreak, rsUpper, "$"].join("|") + ")",
	  rsUpperMisc + "+" + rsOptUpperContr + "(?=" + [rsBreak, rsUpper + rsLowerMisc, "$"].join("|") + ")",
	  rsUpper + "?" + rsLowerMisc + "+" + rsOptLowerContr,
	  rsUpper + "+" + rsOptUpperContr,
	  rsDigits,
	  rsEmoji
	].join("|"), "g");
	var reHasUnicode = RegExp("[" + rsZWJ + rsAstralRange + rsComboMarksRange + rsComboSymbolsRange + rsVarRange + "]");
	var reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;
	var deburredLetters = {
	  // Latin-1 Supplement block.
	  "\xC0": "A",
	  "\xC1": "A",
	  "\xC2": "A",
	  "\xC3": "A",
	  "\xC4": "A",
	  "\xC5": "A",
	  "\xE0": "a",
	  "\xE1": "a",
	  "\xE2": "a",
	  "\xE3": "a",
	  "\xE4": "a",
	  "\xE5": "a",
	  "\xC7": "C",
	  "\xE7": "c",
	  "\xD0": "D",
	  "\xF0": "d",
	  "\xC8": "E",
	  "\xC9": "E",
	  "\xCA": "E",
	  "\xCB": "E",
	  "\xE8": "e",
	  "\xE9": "e",
	  "\xEA": "e",
	  "\xEB": "e",
	  "\xCC": "I",
	  "\xCD": "I",
	  "\xCE": "I",
	  "\xCF": "I",
	  "\xEC": "i",
	  "\xED": "i",
	  "\xEE": "i",
	  "\xEF": "i",
	  "\xD1": "N",
	  "\xF1": "n",
	  "\xD2": "O",
	  "\xD3": "O",
	  "\xD4": "O",
	  "\xD5": "O",
	  "\xD6": "O",
	  "\xD8": "O",
	  "\xF2": "o",
	  "\xF3": "o",
	  "\xF4": "o",
	  "\xF5": "o",
	  "\xF6": "o",
	  "\xF8": "o",
	  "\xD9": "U",
	  "\xDA": "U",
	  "\xDB": "U",
	  "\xDC": "U",
	  "\xF9": "u",
	  "\xFA": "u",
	  "\xFB": "u",
	  "\xFC": "u",
	  "\xDD": "Y",
	  "\xFD": "y",
	  "\xFF": "y",
	  "\xC6": "Ae",
	  "\xE6": "ae",
	  "\xDE": "Th",
	  "\xFE": "th",
	  "\xDF": "ss",
	  // Latin Extended-A block.
	  "\u0100": "A",
	  "\u0102": "A",
	  "\u0104": "A",
	  "\u0101": "a",
	  "\u0103": "a",
	  "\u0105": "a",
	  "\u0106": "C",
	  "\u0108": "C",
	  "\u010A": "C",
	  "\u010C": "C",
	  "\u0107": "c",
	  "\u0109": "c",
	  "\u010B": "c",
	  "\u010D": "c",
	  "\u010E": "D",
	  "\u0110": "D",
	  "\u010F": "d",
	  "\u0111": "d",
	  "\u0112": "E",
	  "\u0114": "E",
	  "\u0116": "E",
	  "\u0118": "E",
	  "\u011A": "E",
	  "\u0113": "e",
	  "\u0115": "e",
	  "\u0117": "e",
	  "\u0119": "e",
	  "\u011B": "e",
	  "\u011C": "G",
	  "\u011E": "G",
	  "\u0120": "G",
	  "\u0122": "G",
	  "\u011D": "g",
	  "\u011F": "g",
	  "\u0121": "g",
	  "\u0123": "g",
	  "\u0124": "H",
	  "\u0126": "H",
	  "\u0125": "h",
	  "\u0127": "h",
	  "\u0128": "I",
	  "\u012A": "I",
	  "\u012C": "I",
	  "\u012E": "I",
	  "\u0130": "I",
	  "\u0129": "i",
	  "\u012B": "i",
	  "\u012D": "i",
	  "\u012F": "i",
	  "\u0131": "i",
	  "\u0134": "J",
	  "\u0135": "j",
	  "\u0136": "K",
	  "\u0137": "k",
	  "\u0138": "k",
	  "\u0139": "L",
	  "\u013B": "L",
	  "\u013D": "L",
	  "\u013F": "L",
	  "\u0141": "L",
	  "\u013A": "l",
	  "\u013C": "l",
	  "\u013E": "l",
	  "\u0140": "l",
	  "\u0142": "l",
	  "\u0143": "N",
	  "\u0145": "N",
	  "\u0147": "N",
	  "\u014A": "N",
	  "\u0144": "n",
	  "\u0146": "n",
	  "\u0148": "n",
	  "\u014B": "n",
	  "\u014C": "O",
	  "\u014E": "O",
	  "\u0150": "O",
	  "\u014D": "o",
	  "\u014F": "o",
	  "\u0151": "o",
	  "\u0154": "R",
	  "\u0156": "R",
	  "\u0158": "R",
	  "\u0155": "r",
	  "\u0157": "r",
	  "\u0159": "r",
	  "\u015A": "S",
	  "\u015C": "S",
	  "\u015E": "S",
	  "\u0160": "S",
	  "\u015B": "s",
	  "\u015D": "s",
	  "\u015F": "s",
	  "\u0161": "s",
	  "\u0162": "T",
	  "\u0164": "T",
	  "\u0166": "T",
	  "\u0163": "t",
	  "\u0165": "t",
	  "\u0167": "t",
	  "\u0168": "U",
	  "\u016A": "U",
	  "\u016C": "U",
	  "\u016E": "U",
	  "\u0170": "U",
	  "\u0172": "U",
	  "\u0169": "u",
	  "\u016B": "u",
	  "\u016D": "u",
	  "\u016F": "u",
	  "\u0171": "u",
	  "\u0173": "u",
	  "\u0174": "W",
	  "\u0175": "w",
	  "\u0176": "Y",
	  "\u0177": "y",
	  "\u0178": "Y",
	  "\u0179": "Z",
	  "\u017B": "Z",
	  "\u017D": "Z",
	  "\u017A": "z",
	  "\u017C": "z",
	  "\u017E": "z",
	  "\u0132": "IJ",
	  "\u0133": "ij",
	  "\u0152": "Oe",
	  "\u0153": "oe",
	  "\u0149": "'n",
	  "\u017F": "ss"
	};
	var freeGlobal = typeof commonjsGlobal == "object" && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;
	var freeSelf = typeof self == "object" && self && self.Object === Object && self;
	var root = freeGlobal || freeSelf || Function("return this")();
	function arrayReduce(array, iteratee, accumulator, initAccum) {
	  var index = -1, length = array ? array.length : 0;
	  while (++index < length) {
	    accumulator = iteratee(accumulator, array[index], index, array);
	  }
	  return accumulator;
	}
	function asciiToArray(string) {
	  return string.split("");
	}
	function asciiWords(string) {
	  return string.match(reAsciiWord) || [];
	}
	function basePropertyOf(object) {
	  return function(key) {
	    return object == null ? void 0 : object[key];
	  };
	}
	var deburrLetter = basePropertyOf(deburredLetters);
	function hasUnicode(string) {
	  return reHasUnicode.test(string);
	}
	function hasUnicodeWord(string) {
	  return reHasUnicodeWord.test(string);
	}
	function stringToArray(string) {
	  return hasUnicode(string) ? unicodeToArray(string) : asciiToArray(string);
	}
	function unicodeToArray(string) {
	  return string.match(reUnicode) || [];
	}
	function unicodeWords(string) {
	  return string.match(reUnicodeWord) || [];
	}
	var objectProto = Object.prototype;
	var objectToString = objectProto.toString;
	var Symbol = root.Symbol;
	var symbolProto = Symbol ? Symbol.prototype : void 0, symbolToString = symbolProto ? symbolProto.toString : void 0;
	function baseSlice(array, start, end) {
	  var index = -1, length = array.length;
	  if (start < 0) {
	    start = -start > length ? 0 : length + start;
	  }
	  end = end > length ? length : end;
	  if (end < 0) {
	    end += length;
	  }
	  length = start > end ? 0 : end - start >>> 0;
	  start >>>= 0;
	  var result = Array(length);
	  while (++index < length) {
	    result[index] = array[index + start];
	  }
	  return result;
	}
	function baseToString(value) {
	  if (typeof value == "string") {
	    return value;
	  }
	  if (isSymbol(value)) {
	    return symbolToString ? symbolToString.call(value) : "";
	  }
	  var result = value + "";
	  return result == "0" && 1 / value == -Infinity ? "-0" : result;
	}
	function castSlice(array, start, end) {
	  var length = array.length;
	  end = end === void 0 ? length : end;
	  return !start && end >= length ? array : baseSlice(array, start, end);
	}
	function createCaseFirst(methodName) {
	  return function(string) {
	    string = toString(string);
	    var strSymbols = hasUnicode(string) ? stringToArray(string) : void 0;
	    var chr = strSymbols ? strSymbols[0] : string.charAt(0);
	    var trailing = strSymbols ? castSlice(strSymbols, 1).join("") : string.slice(1);
	    return chr[methodName]() + trailing;
	  };
	}
	function createCompounder(callback) {
	  return function(string) {
	    return arrayReduce(words(deburr(string).replace(reApos, "")), callback, "");
	  };
	}
	function isObjectLike(value) {
	  return !!value && typeof value == "object";
	}
	function isSymbol(value) {
	  return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
	}
	function toString(value) {
	  return value == null ? "" : baseToString(value);
	}
	var camelCase = createCompounder(function(result, word, index) {
	  word = word.toLowerCase();
	  return result + (index ? capitalize(word) : word);
	});
	function capitalize(string) {
	  return upperFirst(toString(string).toLowerCase());
	}
	function deburr(string) {
	  string = toString(string);
	  return string && string.replace(reLatin, deburrLetter).replace(reComboMark, "");
	}
	var upperFirst = createCaseFirst("toUpperCase");
	function words(string, pattern, guard) {
	  string = toString(string);
	  pattern = pattern;
	  if (pattern === void 0) {
	    return hasUnicodeWord(string) ? unicodeWords(string) : asciiWords(string);
	  }
	  return string.match(pattern) || [];
	}
	lodash_camelcase = camelCase;
	return lodash_camelcase;
}

var lodash_camelcaseExports = requireLodash_camelcase();
var camelCase = /*@__PURE__*/getDefaultExportFromCjs(lodash_camelcaseExports);

const shouldKeepOriginalExport = (cssModuleConfig) => !("localsConvention" in cssModuleConfig && (typeof cssModuleConfig.localsConvention === "function" || cssModuleConfig.localsConvention === "camelCaseOnly" || cssModuleConfig.localsConvention === "dashesOnly"));
const dashesCamelCase = (string) => string.replaceAll(/-+(\w)/g, (_, firstLetter) => firstLetter.toUpperCase());
const getLocalesConventionFunction = (config) => {
  if (!("localsConvention" in config)) {
    return;
  }
  const { localsConvention } = config;
  if (!localsConvention || typeof localsConvention === "function") {
    return localsConvention;
  }
  if (localsConvention === "camelCase" || localsConvention === "camelCaseOnly") {
    return camelCase;
  }
  if (localsConvention === "dashes" || localsConvention === "dashesOnly") {
    return dashesCamelCase;
  }
};

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
const exportsToCode = (exports, exportMode, allowArbitraryNamedExports = false) => {
  let code = "";
  const variables = /* @__PURE__ */ new Set();
  const exportedVariables = Object.entries(exports).flatMap(
    ([exportName, { exportAs, code: value }]) => {
      const jsVariable = pluginutils.makeLegalIdentifier(exportName);
      variables.add(`const ${jsVariable} = \`${value}\`;`);
      return Array.from(exportAs).map((exportAsName) => {
        const exportNameSafe = pluginutils.makeLegalIdentifier(exportAsName);
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
const generateEsm = (imports, exports, exportMode, allowArbitraryNamedExports = false) => importsToCode(imports, exportMode, allowArbitraryNamedExports) + exportsToCode(exports, exportMode, allowArbitraryNamedExports);

const dtsTemplate = (code) => `/* eslint-disable */
/* prettier-ignore */
// @ts-nocheck
/**
 * Generated by vite-css-modules
 * https://npmjs.com/vite-css-modules
 */
${code ? `
${code}
` : ""}`;
const genereateNamedExports = (exportedVariables, exportMode, allowArbitraryNamedExports) => {
  const prepareNamedExports = exportedVariables.map(
    ([jsVariable, exportName]) => {
      if (exportMode === "both" && exportName === '"default"') {
        return;
      }
      if (jsVariable === exportName) {
        return `	${jsVariable}`;
      }
      if (exportName[0] !== '"' || allowArbitraryNamedExports) {
        return `	${jsVariable} as ${exportName}`;
      }
      return "";
    }
  ).filter(Boolean);
  if (prepareNamedExports.length === 0) {
    return "";
  }
  return `export {
${prepareNamedExports.join(",\n")}
};`;
};
const generateDefaultExport = (exportedVariables) => {
  const properties = exportedVariables.map(
    ([jsVariable, exportName]) => {
      const key = jsVariable === exportName ? jsVariable : exportName;
      return `	${key}: typeof ${jsVariable};`;
    }
  ).join("\n");
  return `declare const _default: {
${properties}
};
export default _default;`;
};
const generateTypes = (exports, exportMode, allowArbitraryNamedExports = false) => {
  const variables = /* @__PURE__ */ new Set();
  const exportedVariables = Object.entries(exports).flatMap(
    ([exportName, { exportAs }]) => {
      const jsVariable = pluginutils.makeLegalIdentifier(exportName);
      variables.add(`declare const ${jsVariable}: string;`);
      return Array.from(exportAs).map((exportAsName) => {
        const exportNameSafe = pluginutils.makeLegalIdentifier(exportAsName);
        if (exportAsName !== exportNameSafe) {
          exportAsName = JSON.stringify(exportAsName);
        }
        return [jsVariable, exportAsName];
      });
    }
  );
  if (exportedVariables.length === 0) {
    return dtsTemplate();
  }
  return dtsTemplate([
    Array.from(variables).join("\n"),
    exportMode === "both" || exportMode === "named" ? genereateNamedExports(exportedVariables, exportMode, allowArbitraryNamedExports) : "",
    exportMode === "both" || exportMode === "default" ? generateDefaultExport(exportedVariables) : ""
  ].filter(Boolean).join("\n\n"));
};

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
  const filter = pluginutils.createFilter(cssModuleRE);
  const allowArbitraryNamedExports = supportsArbitraryModuleNamespace(config);
  const cssConfig = config.css;
  const cssModuleConfig = { ...cssConfig.modules };
  const lightningCssOptions = { ...cssConfig.lightningcss };
  const { devSourcemap } = cssConfig;
  const isLightningCss = cssConfig.transformer === "lightningcss";
  const loadTransformer = isLightningCss ? Promise.resolve().then(function () { return require('./lightningcss-HagSkt1i.cjs'); }) : Promise.resolve().then(function () { return require('./index-CvtKU2sG.cjs'); });
  let transform;
  const exportMode = patchConfig?.exportMode ?? "both";
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
      handler: async (id) => {
        if (!filter(id)) {
          return;
        }
        id = id.split("?", 2)[0];
        return await promises.readFile(id, "utf8");
      }
    },
    async transform(inputCss, id) {
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
      const exports = Object.fromEntries(exportEntries);
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
        for (const exported of Object.values(exports)) {
          for (const exportAs of exported.exportAs) {
            json[exportAs] = exported.resolved;
          }
        }
        cssModuleConfig.getJSON(id, json, id);
      }
      const jsCode = generateEsm(
        imports,
        exports,
        exportMode,
        allowArbitraryNamedExports
      );
      if (patchConfig?.generateSourceTypes) {
        const filePath = id.split("?", 2)[0];
        if (filePath && cssModuleRE.test(filePath)) {
          const fileExists = await promises.access(filePath).then(() => true, () => false);
          if (fileExists) {
            await promises.writeFile(
              `${filePath}.d.ts`,
              generateTypes(exports, exportMode, allowArbitraryNamedExports)
            );
          }
        }
      }
      return {
        code: jsCode,
        map: map ?? { mappings: "" },
        meta: {
          [pluginName]: {
            css: outputCss,
            exports
          }
        }
      };
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

exports.cssModules = cssModules;
exports.patchCssModules = patchCssModules;
exports.pluginName = pluginName;
