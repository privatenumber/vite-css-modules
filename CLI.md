# CLI

## Objective

Generate `.d.ts` files for CSS Modules without running a Vite build, while staying close enough to project behavior that the output matches real usage for common setups.

## Constraints

- The CLI should not call `vite build()` or `createServer()`.
- The CLI should support preprocessed CSS inputs like `.scss`, `.sass`, `.less`, and `.styl`.
- The CLI should honor relevant project config when possible.
- The CLI should validate cross-file CSS Modules dependencies like `composes from` and `@value from`.
- The CLI should avoid running the full user plugin graph by default.

## Non-Goals

- Full runtime parity with arbitrary Vite plugins.
- Executing the application build pipeline.
- Supporting every possible config side effect transparently.
- Reimplementing Sass/Less/Stylus parsing ourselves.

## Rollout Plan

The current design should be treated as the end-state target, not the first implementation step.

Recommended delivery order:

1. prove the risky assumptions on real repos
2. ship a narrow project-mode MVP
3. add recursive dependency correctness
4. add first-party plugin parity
5. add operational hardening and any remaining optional parity

The CLI should earn its way into the full design instead of starting there.

### Phase 0: Feasibility Spike

Goal:

- validate that lightweight Vite-assisted loading is viable on real monorepos

Build:

- config discovery
- `loadConfigFromFile(..., 'bundle')`
- config sanitization
- `resolveConfig()`
- `preprocessCSS()` on a single target file
- debug output only, no `.d.ts` generation required

Do not build yet:

- recursive `composes` / `@value` resolution
- plugin-option extraction
- declaration maps
- batch file generation

Success criteria:

- can load representative `vite.config.*` files without starting a server or build
- can preprocess real `.module.scss` files
- can show the resolved `root`, `css.modules`, and alias information used for a file

Fail criteria:

- config loading is too brittle even with `bundle`
- `preprocessCSS()` still requires too much of the plugin graph to be useful

### Phase 1: Minimal Project-Mode MVP (Implemented)

Goal:

- generate correct `.d.ts` for standalone files where exports come from the file itself

Build:

- file globbing
- project mode config loading
- `preprocessCSS()`
- local export extraction from the preprocessed output
- `generateTypes()`
- hard failure on preprocessing or transform errors

Supported scope:

- `.module.css`
- `.module.scss`
- `css.modules.localsConvention`
- `css.modules.exportGlobals`

Status:

- implemented
- includes config-aware preprocessing and local export generation
- no longer the current boundary of the CLI

Why this phase matters:

- it validates the biggest architectural bet, which is "load config lightly, preprocess, then extract"
- it gives an immediately usable CLI for a meaningful subset of repos

### Phase 2: Dependency Graph MVP (Implemented)

Goal:

- make cross-file CSS Modules graphs correct instead of best-effort

Build:

- recursive export loader
- Vite-resolver-based dependency resolution
- memoization
- hard errors for missing files and missing exports

Add tests for:

- `composes from './file.module.css'`
- `@value foo from './tokens.css'`
- alias-based specifiers
- unresolved file and unresolved export failures

Status:

- implemented
- includes recursive dependency validation, alias-aware resolution, and memoization

### Phase 3: First-Party Plugin Parity (Implemented For Current Scope)

Goal:

- preserve settings configured through this package's own Vite plugin

Build:

- stable metadata on `patchCssModules()` plugin instances
- extraction of first-party plugin options before sanitizing plugins away
- precedence rules between CLI flags and plugin-config defaults

Implemented:

- `exportMode` from `patchCssModules()`
- CLI flag precedence over plugin-config defaults
- `declarationMap` from `patchCssModules()`
- `declarationMap: false` overriding `tsconfig.json`

Remaining:

- any future CLI-relevant plugin metadata

This phase is especially important for repos like square-web that configure behavior through `patchCssModules()` instead of only `config.css`.

### Phase 4: Hardening And Scale (Next)

Goal:

- make the CLI operationally safe for large monorepos

Build:

- better diagnostics
- audit/debug mode
- concurrency limits if needed
- clearer config-loader guidance

This is the main remaining work after the current implementation.

## Proposed Design

Use a lightweight Vite-assisted flow:

1. Load the user's Vite config file.
2. Keep only the config needed for CSS preprocessing and CSS Modules behavior.
3. Resolve that reduced config with Vite.
4. Use Vite's `preprocessCSS()` for syntax support.
5. Run this package's CSS Modules extraction on the preprocessed CSS.
6. Recursively resolve CSS Modules dependencies and generate `.d.ts`.

This gives us CSS preprocessing and config parity without starting a server or doing a build.

In practice, the current CLI already covers the Phase 1 and Phase 2 shape, plus the currently relevant Phase 3 parity for `exportMode` and `declarationMap`. The remaining work is operational hardening and optional future parity extensions.

## Modes

### Project Mode

Default when a Vite config file is found.

- Loads `vite.config.*`
- Uses Vite config for:
  - `resolve.alias`
  - `css.modules`
  - `css.preprocessorOptions`
  - `css.transformer`
  - optionally `css.postcss` later
- Supports preprocessors and alias-based CSS imports
- Validates `composes from` and `@value from`

### No-Config Mode

Explicit fallback via `--no-config`, or implicit when no config file exists.

- No Vite config loading
- Best-effort plain behavior
- Useful for simple `.module.css` generation
- Useful as an escape hatch when project config is expensive or incompatible
- Should be documented as lower-parity mode

## Config Loading Boundary

We should use Vite only for config loading and CSS preprocessing.

### Load

Use `loadConfigFromFile()` with:

- `command: 'serve'`
- user-specified `mode`
- user-specified `config` path when provided
- configurable `configLoader`

Recommended default:

- `configLoader: 'bundle'`

Why:

- `runner` is attractive in theory, but real monorepo configs often rely on `__dirname` patterns that break under the module runner.
- `native` tends to break on TypeScript and ESM shared-config imports.
- `bundle` is the most reliable way to evaluate config files without starting a server or build.

### Guardrail

Before loading config, set:

```ts
process.env.VITE_CSS_MODULES_CLI = '1'
```

This gives users an escape hatch for unusual config behavior inside `vite.config.*`.

### Sanitize

After loading config, discard everything except the CSS-relevant subset:

```text
const safeConfig = {
	configFile: false,
	root,
	mode,
	plugins: [],
	resolve: {
		alias: userConfig.resolve?.alias,
	},
	css: {
		transformer: userConfig.css?.transformer,
		modules: userConfig.css?.modules,
		preprocessorOptions: userConfig.css?.preprocessorOptions,
		postcss: userConfig.css?.postcss,
	},
}
```

Then pass that reduced object to `resolveConfig()`.

This is the key boundary:

- we do load the config file
- we do not run the user's plugin graph as part of CLI generation

## Plugin Option Parity

Discarding the plugin graph is correct for performance and isolation, but it creates one important gap:

- this package's own `patchCssModules()` options may be configured in `vite.config.*`
- those options are not represented in `config.css`
- if we drop plugins blindly, the CLI loses settings like `exportMode`

Recommended approach:

1. Load the user config file.
2. Inspect the raw `plugins` array before sanitizing.
3. Extract only `vite-css-modules` plugin metadata.
4. Drop the full plugin graph before `resolveConfig()`.

The CLI should not try to preserve arbitrary plugin behavior. It should only preserve configuration for this package's own plugin.

That likely means exposing stable metadata on the plugin instance, for example a symbol or property carrying the `patchCssModules()` options, so the CLI can read:

- `exportMode`
- `declarationMap`
- any future CLI-relevant plugin options

Suggested precedence:

1. explicit CLI flags
2. detected `patchCssModules()` options from config
3. `config.css.modules`
4. package defaults

## Generation Pipeline

For each matched file:

1. Read source from disk.
2. Preprocess with Vite `preprocessCSS()`.
3. Feed preprocessed output into the package's CSS Modules extraction.
4. Resolve and validate dependency references.
5. Build inline declaration maps when enabled through `patchCssModules()` or `tsconfig.json`.
6. Convert exports into `.d.ts` declarations.
7. Write `<file>.d.ts` only if content changed.

Pseudo-shape:

```ts
const preprocessed = await preprocessCSS(code, filePath, resolvedConfig)
const cssModule = transform(
    preprocessed.code,
    cleanUrl(path.relative(resolvedConfig.root, filePath)),
    resolvedConfig.css.modules ?? {},
    false
)
const exports = await resolveCssModuleExports(cssModule.exports, filePath, context)
const sourceMapOptions = resolveDeclarationMapOptions(filePath, source, context)

return generateTypes(exports, exportMode, arbitraryExports, sourceMapOptions)
```

## Dependency Resolution

The CLI should not stop at local class extraction.

It needs a recursive loader similar to the plugin's internal `loadExports()` path:

- resolve `composes from './file.module.css'`
- resolve `@value foo from './tokens.css'`
- throw on missing files
- throw on missing exports
- memoize per file to avoid repeated work

Resolution should use Vite's resolver from `resolvedConfig.createResolver()` instead of raw `path.resolve()`, so alias-based specifiers work.

## Why This Design

This avoids the two bad extremes:

### Too Much Vite

- `build()`
- `createServer()`
- full plugin container
- full app graph execution

That defeats the point of a fast type-generation CLI.

### Too Little Vite

- raw file read
- raw PostCSS CSS parse
- no preprocessors
- no alias resolution
- no `css.modules` config parity
- silent dependency failures

That is what caused the correctness gaps in the current CLI PR.

## Supported Parity

This design should give us good parity for:

- `.css`
- `.scss`
- `.sass`
- `.less`
- `.styl`
- `resolve.alias`
- `css.modules.localsConvention`
- `css.modules.exportGlobals`
- `css.modules.globalModulePaths`
- `css.modules.generateScopedName`
- `composes from`
- `@value from`

## Intentional Limits

Even in project mode, the CLI should not promise full parity with:

- custom Vite plugins that mutate CSS before CSS Modules extraction
- arbitrary `config()` / `configResolved()` plugin side effects
- app-specific runtime conditions outside CSS preprocessing

Those are outside the intended scope of a lightweight generator.

## Monorepo Audit: square-web

Audited against:

- `/Users/osame/Developer/github/squareup/square-web-worktrees/worktree-6`

### Footprint

- `1859` `*.module.css` files
- `96` `*.module.scss` files
- no observed `*.module.sass`, `*.module.less`, or `*.module.styl` files in the audit sweep

Conclusion:

- plain `.css` support is necessary but not sufficient
- `.scss` preprocessing is required for this monorepo to be viable
- Sass indented syntax and Less/Stylus support matter less for this specific repo, but should still remain part of the general CLI design

### Config Loading Results

Audit samples showed:

- `loadConfigFromFile(..., 'runner')`: `69 / 80` succeeded, `11 / 80` failed
- representative `runner` failures included `__dirname is not defined`
- `loadConfigFromFile(..., 'native')` failed on shared TypeScript config imports in sampled cases
- `loadConfigFromFile(..., 'bundle')`: `120 / 120` succeeded in the sample sweep

Implication:

- `bundle` should be the default loader for project mode
- `runner` should remain opt-in, not the default

### Real Problems Exposed By This Repo

#### Shared Base Config And Plugin-Heavy Vite Setup

This monorepo has many package-level Vite configs and a shared root `vite.base.ts` that wires in plugins such as:

- `patchCssModules()`
- `@vitejs/plugin-react-swc`
- i18n and dev-proxy plugins
- `unplugin-dts`
- `dtsroll`
- `vite-plugin-svgr`

Problem:

- project-mode CLI config loading will execute `vite.config.*`
- those configs may import or construct many plugins even if the CLI later strips them

Proposed solution:

- use `loadConfigFromFile(..., 'bundle')`
- set `process.env.VITE_CSS_MODULES_CLI = '1'` before config load
- document that configs can branch on that env var to disable expensive or incompatible setup
- sanitize to CSS-only config before `resolveConfig()`
- never call `build()` or `createServer()`

#### Invocation CWD Matters

Some square-web config helpers derive Vite `root` from `process.cwd()` instead of the config file location.

Problem:

- loading the same config from the wrong cwd produces misleading results
- project mode cannot assume the config directory is the only relevant path context

Proposed solution:

- treat the shell cwd as part of project-mode input
- default to the user's actual invocation cwd
- add `--cwd <path>` for explicit control during scripted or cross-repo usage
- resolve relative file arguments and relative `--config` from `--cwd`
- fall back to the shell cwd for relative inputs that do not resolve from `--cwd`, so existing scripted usage does not break immediately
- in audit tooling, default cwd to the discovered workspace root when probing an external repo

#### Alias-Based CSS Module Imports

This repo uses aliased CSS Module imports such as:

- `#styles/shared.module.scss`
- `#components/onboarding/steps/IntroStep.module.scss`

Problem:

- raw `path.resolve()` is not enough for dependency resolution
- recursive `composes from` and `@value from` can also require alias resolution

Proposed solution:

- resolve dependencies through Vite's resolver from `resolvedConfig.createResolver()`
- do not implement a parallel alias resolver in the CLI

#### Preprocessor Support Is Mandatory

Problem:

- the current raw-PostCSS CLI shape will not work for `.module.scss`
- this monorepo has enough SCSS usage that "plain CSS only" is not a practical mode

Proposed solution:

- preprocess every matched file through Vite `preprocessCSS()`
- treat preprocessing failure as a hard CLI error

#### `patchCssModules()` Option Parity

This repo already configures this package in Vite, including patterns like:

- `patchCssModules({ generateSourceTypes: true, exportMode: 'default' })`
- package-specific overrides through shared config helpers

Problem:

- if the CLI only reads `config.css`, it will miss options configured through `patchCssModules()`
- that creates parity gaps even when config loading otherwise succeeds

Proposed solution:

- preserve recognized `patchCssModules()` metadata before stripping plugins
- let CLI flags override detected plugin config
- do not attempt to preserve unrelated plugin behavior

This is the biggest square-web-specific reason the CLI should not be "CSS-only sanitize" in the narrow sense. It needs "CSS config plus first-party plugin config".

#### Configs With No Relevant `css` Block

Many audited package configs do not define top-level `css` or `resolve` keys themselves.

Implication:

- project mode must tolerate sparse package configs
- absence of `config.css` is not a failure condition
- the CLI should fall back cleanly to Vite defaults plus explicit CLI flags

#### Custom Scoped Name Functions

Some packages define custom `css.modules.generateScopedName`.

Assessment:

- this matters for runtime class values
- it does not materially affect `.d.ts` export names

Implication:

- CLI type generation does not need to replicate generated scoped values
- preserving export names and dependency resolution is the important parity target

### Overall Recommendation For square-web

The CLI can be made viable for this monorepo, but only with these conditions:

1. project mode defaults to `configLoader: 'bundle'`
2. project mode respects invocation cwd and offers `--cwd`
3. project mode uses Vite `preprocessCSS()`
4. dependency resolution goes through Vite's resolver
5. the CLI extracts first-party `patchCssModules()` options before discarding plugins
6. `--no-config` remains available as an escape hatch for isolated plain-CSS usage

Without those changes, the CLI will not be reliable enough for square-web.

### Audit Outcome

The audit result is:

- good news for the overall architecture
- bad news for the broader parity assumptions

What this means:

- we should continue with the lightweight Vite-assisted direction
- we should not pivot away from `loadConfigFromFile()` + `resolveConfig()` + `preprocessCSS()`
- we should narrow the implementation scope harder than the original design implied

Confidence increased in:

- `configLoader: 'bundle'` as the default
- using real project config without running a build or server
- `preprocessCSS()` as the Phase 1 engine
- supporting real monorepos like square-web with a project-mode CLI

Confidence decreased in:

- `runner` as a realistic default loader
- "CSS-only sanitize" as a full parity strategy
- ignoring invocation cwd
- assuming `patchCssModules()` parity comes for free from loaded config

Plan impact:

1. Keep the current architecture. It has already proven viable in real repos.
2. Treat Phase 4 hardening as the next default workstream.
3. Treat declaration-map parity as an optional follow-on feature, not part of the core CLI viability story.

Bottom line:

- no architecture pivot is needed
- the core CLI design is working
- the remaining work is mostly hardening, coverage expansion, and optional parity

## Flags

Recommended flags:

- `--config <path>`
- `--cwd <path>`
- `--mode <mode>`
- `--config-loader <runner|native|bundle>`
- `--no-config`
- `--export-mode <both|named|default>`
- `--locals-convention <camelCase|camelCaseOnly|dashes|dashesOnly>`
- `--arbitrary-exports`

## Error Behavior

The CLI should fail loudly for:

- config load errors
- preprocessing errors
- unresolved CSS dependency files
- unresolved CSS dependency exports
- invalid flag values

It should not silently emit `.d.ts` for broken CSS Modules graphs.

`--no-config` should bypass config loading entirely so users still have a recovery path when a repo's Vite config cannot be evaluated safely in CLI mode.

## Future Work

### Declaration Maps

If we add declaration map support to the CLI later, `css-class-positions` is the right tool for source positions after export extraction is done.

It is not the answer for preprocessing or CSS Modules export resolution.

### PostCSS Config Parity

If needed, we can later expand project mode to honor more PostCSS-specific behavior, but that should be a deliberate step after the core preprocessing and dependency-resolution path is correct.
