# vite-css-modules <a href="https://npm.im/vite-css-modules"><img src="https://badgen.net/npm/v/vite-css-modules"></a> <a href="https://npm.im/vite-css-modules"><img src="https://badgen.net/npm/dm/vite-css-modules"></a>

Vite plugin to fix broken CSS Modules handling.

[→ Play with a demo on StackBlitz](https://stackblitz.com/edit/vitejs-vite-v9jcwo?file=src%2Fstyle.module.css)

> [!NOTE]
> We're working to integrate this fix directly into Vite ([PR #16018](https://github.com/vitejs/vite/pull/16018)). Until then, use this plugin to benefit from these improvements now.

<br>

<p align="center">
	<a href="https://github.com/sponsors/privatenumber/sponsorships?tier_id=398771"><img width="412" src="https://raw.githubusercontent.com/privatenumber/sponsors/master/banners/assets/donate.webp"></a>
	<a href="https://github.com/sponsors/privatenumber/sponsorships?tier_id=416984"><img width="412" src="https://raw.githubusercontent.com/privatenumber/sponsors/master/banners/assets/sponsor.webp"></a>
</p>

<br>

## Why use this plugin?

Have you encountered any of these Vite CSS Module bugs? They're happening because Vite's CSS Modules implementation delegates everything to `postcss-modules`, creating a black box that Vite can't see into.

This plugin fixes these issues by properly integrating CSS Modules into Vite's build pipeline.

### The bugs this fixes

<details>
<summary>1. PostCSS plugins don't apply to <code>composes</code> dependencies</summary><br>

When you use `composes` to import classes from another CSS file, Vite's PostCSS plugins never process the imported file. This means your PostCSS transformations, auto-prefixing, or custom plugins are silently skipped for dependencies.

**What happens in Vite:**
- `style.module.css` gets processed by PostCSS ✓
- `utils.css` does NOT get processed by PostCSS ✗
- Your PostCSS plugin never sees `utils.css` because `postcss-modules` bundles it internally

**With this plugin:**
- Both files go through your PostCSS pipeline correctly

[Vite issue #10079](https://github.com/vitejs/vite/issues/10079), [#10340](https://github.com/vitejs/vite/issues/10340) | [Test case](https://github.com/privatenumber/vite-css-modules/blob/develop/tests/specs/reproductions.spec.ts#L62-L85)

</details>

<details>
<summary>2. Shared classes get duplicated in your bundle</summary><br>

When multiple CSS Modules compose from the same utility file, the utility's styles get bundled multiple times. This increases bundle size and can cause style conflicts.

**Example:**
```css
/* utils.css */
.button { padding: 10px; }

/* header.module.css */
.title { composes: button from './utils.css'; }

/* footer.module.css */
.link { composes: button from './utils.css'; }
```

**What happens in Vite:**
```css
/* Final bundle contains .button styles TWICE */
.button { padding: 10px; }  /* from header.module.css */
.button { padding: 10px; }  /* from footer.module.css - duplicated! */
```

**With this plugin:**
```css
/* Final bundle contains .button styles ONCE */
.button { padding: 10px; }  /* deduplicated */
```

[Vite issue #7504](https://github.com/vitejs/vite/issues/7504), [#15683](https://github.com/vitejs/vite/issues/15683) | [Test case](https://github.com/privatenumber/vite-css-modules/blob/develop/tests/specs/reproductions.spec.ts#L62-L85)

</details>

<details>
<summary>3. Missing <code>composes</code> classes fail silently</summary><br>

If you typo a class name in `composes`, Vite doesn't error. Instead, it outputs `undefined` in your class names, breaking your UI with no warning.

**Example:**
```css
.button {
  composes: nonexistant from './utils.css';  /* Typo! */
}
```

**What happens in Vite:**
```js
import styles from './style.module.css'

console.log(styles.button) // "_button_abc123 undefined" - no error!
```

**With this plugin:**
```
Error: Cannot find class 'nonexistent' in './utils.css'
```

[Vite issue #16075](https://github.com/vitejs/vite/issues/16075) | [Test case](https://github.com/privatenumber/vite-css-modules/blob/develop/tests/specs/reproductions.spec.ts#L314-L326)

</details>

<details>
<summary>4. Can't compose between CSS and SCSS</summary><br>

Trying to compose from SCSS/Sass files causes syntax errors because `postcss-modules` tries to parse SCSS as plain CSS.

**Example:**
```scss
/* base.module.scss */
.container { display: flex; }
```

```css
/* style.module.css */
.wrapper { composes: container from './base.module.scss'; }
```

**What happens in Vite:**
```
CssSyntaxError: Unexpected '/'
```

**With this plugin:**
- Works correctly because each file goes through its proper preprocessor first

[Vite issue #10340](https://github.com/vitejs/vite/issues/10340) | [Test case](https://github.com/privatenumber/vite-css-modules/blob/develop/tests/specs/reproductions.spec.ts#L174-L191)

</details>

<details>
<summary>5. HMR doesn't work properly</summary><br>

Changing a CSS Module file causes a full page reload instead of a hot update, losing component state.

**What happens in Vite:**
- Full page reload on CSS Module changes

**With this plugin:**
- CSS Module changes update instantly without losing component state

[Vite issue #16074](https://github.com/vitejs/vite/issues/16074) | [Test case](https://github.com/privatenumber/vite-css-modules/blob/develop/tests/specs/reproductions.spec.ts#L328-L349)

</details>

<details>
<summary>6. Reserved JavaScript keywords break exports</summary><br>

Using JavaScript reserved keywords as class names (like `.import`, `.export`) generates invalid JavaScript code.

**Example:**
```css
.import { color: red; }
.export { color: blue; }
```

**What happens in Vite:**
```js
// Tries to generate invalid JavaScript:
export const import = "...";  // Syntax error "import" is reserved!
export const export = "...";  // Syntax error "export" is reserved!
```

**With this plugin:**
- Properly handles reserved keywords in class names

[Vite issue #14050](https://github.com/vitejs/vite/issues/14050) | [Test case](https://github.com/privatenumber/vite-css-modules/blob/develop/tests/specs/reproductions.spec.ts#L194-L211)

</details>

## Install
```sh
npm install -D vite-css-modules
```

## Setup

In your Vite config file, add the `patchCssModules()` plugin to patch Vite's CSS Modules behavior:

```ts
// vite.config.js
import { patchCssModules } from 'vite-css-modules'

export default {
    plugins: [
        patchCssModules() // ← This is all you need to add!

        // Other plugins...
    ],
    css: {
        // Your existing CSS Modules configuration
        modules: {
            // ...
        },
        // Or if using LightningCSS
        lightningcss: {
            cssModules: {
                // ...
            }
        }
    },
    build: {
        // Recommended minimum target (See FAQ for more details)
        target: 'es2022'
    }
}
```

This patches your Vite to handle CSS Modules in a more predictable way.

### Configuration
Configuring the CSS Modules behavior remains the same as before.

Read the [Vite docs](https://vite.dev/guide/features.html#css-modules) to learn more.

### Type checking & navigation for CSS Modules

This plugin can generate type definition (`.d.ts`) files for CSS Modules, providing autocomplete and type checking for class names. For example, importing `style.module.css` will create a `style.module.css.d.ts` next to it:

```ts
patchCssModules({
    generateSourceTypes: true
})
```

#### Go to CSS Definition

Add `declarationMap` to include inline source maps in the generated `.d.ts` files:

```ts
patchCssModules({
    generateSourceTypes: true,
    declarationMap: true
})
```

This enables **"Go to Definition"** (<kbd>F12</kbd> / <kbd>Cmd</kbd>+Click in VS Code) to jump from a CSS class name in TypeScript directly to where it's defined in the CSS file. Without declaration maps, "Go to Definition" lands on the generated `.d.ts` — a machine-generated file with no useful context.

<video src="https://github.com/user-attachments/assets/968f5f57-e7ef-4268-9a0e-f14734e01940" width="100" autoplay loop muted playsinline></video>

When not explicitly set, `declarationMap` auto-detects from `tsconfig.json`'s `compilerOptions.declarationMap`.

## API

### `patchCssModules(options)`

#### `exportMode`

- **Type**: `'both' | 'named' | 'default'`
- **Default**: `'both'`

Specifies how class names are exported from the CSS Module:

- **`both`**: Exports class names as both named and default exports.
- **`named`**: Exports class names as named exports only.
- **`default`**: Exports class names as a default export only (an object where keys are class names).

#### `generateSourceTypes`

- **Type**: `boolean`
- **Default**: `false`

Generates a `.d.ts` file next to each CSS Module with type definitions for the exported class names.

#### `declarationMap`

- **Type**: `boolean`
- **Default**: Auto-detected from `tsconfig.json`'s `compilerOptions.declarationMap`

Generates inline declaration source maps in `.d.ts` files, enabling "Go to Definition" to navigate from TypeScript to CSS source. Requires `generateSourceTypes` to be enabled.

> [!TIP]
> Source maps are always inlined rather than emitted as separate `.d.ts.map` files. Since `.d.ts` files are generated in-place next to your CSS source, external map files would pollute the source directory. The size overhead of inlining is negligible for typical CSS modules.

## FAQ

### What issues does this plugin address?

Vite delegates bundling each CSS Module to [`postcss-modules`](https://github.com/madyankin/postcss-modules), leading to significant problems:

1. **CSS Modules not integrated into Vite's build**

    Since `postcss-modules` is a black box that only returns the final bundled output, Vite plugins can't hook into the CSS Modules build or process their internal dependencies. This prevents post-processing by plugins like SCSS, PostCSS, or LightningCSS. ([#10079](https://github.com/vitejs/vite/issues/10079), [#10340](https://github.com/vitejs/vite/issues/10340))

2. **Duplicated CSS Module dependencies**

    Bundling CSS Modules separately duplicates shared dependencies, increasing bundle size and causing style overrides. ([#7504](https://github.com/vitejs/vite/issues/7504), [#15683](https://github.com/vitejs/vite/issues/15683))

3. **Silent failures on unresolved dependencies**

    `postcss-modules` fails silently when it can't resolve a `composes` dependency—missing exports don't throw errors, making CSS bugs harder to catch. ([#16075](https://github.com/vitejs/vite/issues/16075))

The `vite-css-modules` plugin fixes these issues by seamlessly integrating CSS Modules into Vite's build process.

### How does this work?

The plugin treats CSS Modules as JavaScript modules, fully integrating them into Vite's build pipeline. Here's how:

- **Transforms CSS into JS modules**

  CSS Modules are compiled into JS files that load the CSS. `composes` rules become JS imports, and class names are exported as named JS exports.

- **Integrates with Vite's module graph**

  Because they're now JS modules, CSS Modules join Vite's module graph. This enables proper dependency resolution, bundling, and de-duplication.

- **Unlocks plugin compatibility**

  Other Vite plugins can now access and process CSS Modules—fixing the prior limitation where dependencies inside them were invisible.

This model is similar to Webpack's `css-loader`, making it familiar to devs transitioning from Webpack. It also reduces overhead and improves performance in larger projects.


### Does it export class names as named exports?

Yes, but there are a few things to keep in mind:

- **JavaScript naming restrictions**

  Older JavaScript versions don't allow special characters (like `-`) in variable names. So a class like `.foo-bar` couldn't be imported as `foo-bar` and had to be accessed via the default export.

- **Using `localsConvention`**

  To work around this, set `css.modules.localsConvention: 'camelCase'` in your Vite config. This converts `foo-bar` → `fooBar`, making it a valid named export.

- **ES2022 support for arbitrary names**

  With ES2022, you can now export/import names with any characters using quotes. This means `.foo-bar` can be used as a named export directly.

To enable this, set your build target to `es2022`:

```js
// vite.config.js
export default {
    build: {
        target: 'es2022'
    }
}
```

Then import using:

```js
import { 'foo-bar' as fooBar } from './styles.module.css'

// Use it
console.log(fooBar)
```

This gives you full named export access—even for class names with previously invalid characters.

## Sponsors

<p align="center">
	<a href="https://github.com/sponsors/privatenumber">
		<img src="https://cdn.jsdelivr.net/gh/privatenumber/sponsors/sponsorkit/sponsors.svg">
	</a>
</p>
