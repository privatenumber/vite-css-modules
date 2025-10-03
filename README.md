# vite-css-modules <a href="https://npm.im/vite-css-modules"><img src="https://badgen.net/npm/v/vite-css-modules"></a> <a href="https://npm.im/vite-css-modules"><img src="https://badgen.net/npm/dm/vite-css-modules"></a>

Vite plugin to fix broken CSS Modules handling.

[→ Play with a demo on StackBlitz](https://stackblitz.com/edit/vitejs-vite-v9jcwo?file=src%2Fstyle.module.css)

Note: We're working to integrate this fix directly into Vite ([PR #16018](https://github.com/vitejs/vite/pull/16018)). Until then, use this plugin to benefit from these improvements now.

<br>

<p align="center">
	<a href="https://github.com/sponsors/privatenumber/sponsorships?tier_id=398771"><img width="412" src="https://raw.githubusercontent.com/privatenumber/sponsors/master/banners/assets/donate.webp"></a>
	<a href="https://github.com/sponsors/privatenumber/sponsorships?tier_id=416984"><img width="412" src="https://raw.githubusercontent.com/privatenumber/sponsors/master/banners/assets/sponsor.webp"></a>
</p>

<br>

## Why use this plugin?

Vite's current CSS Modules implementation has critical bugs. This plugin resolves:

- **Dependency Duplication**: Avoid duplicated styles, reducing conflicts and bundle size. ([#7504](https://github.com/vitejs/vite/issues/7504), [#15683](https://github.com/vitejs/vite/issues/15683))

- **HMR Fixes**: Enables proper Hot Module Replacement (HMR) for CSS Modules. ([#16074](https://github.com/vitejs/vite/issues/16074))

- **Plugin Compatibility**: Ensures compatibility with plugins like PostCSS and SCSS. ([#10079](https://github.com/vitejs/vite/issues/10079), [#10340](https://github.com/vitejs/vite/issues/10340))

- **Composition Handling**: Properly errors on missing dependencies and supports reserved JS keyword class names. ([#16075](https://github.com/vitejs/vite/issues/16075), [#14050](https://github.com/vitejs/vite/issues/14050))

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


### Strongly typed CSS Modules (Optional)

As a bonus feature, this plugin can generate type definitions (`.d.ts` files) for CSS Modules. For example, if `style.module.css` is imported, it will create a `style.module.css.d.ts` file next to it with the type definitions for the exported class names:

```ts
patchCssModules({
    generateSourceTypes: true
})
```

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

This option generates a `.d.ts` file next to each CSS module file.


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
```

This gives you full named export access—even for class names with previously invalid characters.

## Sponsors

<p align="center">
	<a href="https://github.com/sponsors/privatenumber">
		<img src="https://cdn.jsdelivr.net/gh/privatenumber/sponsors/sponsorkit/sponsors.svg">
	</a>
</p>
