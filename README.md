# vite-css-modules <a href="https://npm.im/vite-css-modules"><img src="https://badgen.net/npm/v/vite-css-modules"></a> <a href="https://npm.im/vite-css-modules"><img src="https://badgen.net/npm/dm/vite-css-modules"></a>

CSS Modules is currently broken in Vite. This Vite plugin fixes them by correctly handling CSS Modules.

Note: We're working to integrate this fix directly into Vite ([PR #16018](https://github.com/vitejs/vite/pull/16018)). Until then, use this plugin to benefit from these improvements now.

[→ Play with a demo on StackBlitz](https://stackblitz.com/edit/vitejs-vite-v9jcwo?file=src%2Fstyle.module.css)

<br>

<p align="center">
	<a href="https://github.com/sponsors/privatenumber/sponsorships?tier_id=398771"><img width="412" src="https://raw.githubusercontent.com/privatenumber/sponsors/master/banners/assets/donate.webp"></a>
	<a href="https://github.com/sponsors/privatenumber/sponsorships?tier_id=416984"><img width="412" src="https://raw.githubusercontent.com/privatenumber/sponsors/master/banners/assets/sponsor.webp"></a>
</p>

<br>

## Why use this plugin?

Currently, CSS Modules is implemented incorrectly in Vite, leading to critical issues that makes it unusable. This plugin corrects the implementation, fixing many known bugs and making CSS Modules work expectedly in your projects.

Here are the issues this plugin addresses:

#### Dependency duplication

Prevents duplicated CSS Modules, preventing style conflicts from duplication and minimizing bundle size
- [vitejs/vite#7504: CSS Modules composed styles are duplicated](https://github.com/vitejs/vite/issues/7504)
- [vitejs/vite#15683: CSS Modules duplicated styles re-declares classes](https://github.com/vitejs/vite/issues/15683)

#### Hot Module Replacement (HMR) issues

Enables HMR in CSS Module dependencies, improving development efficiency
- [vitejs/vite#16074: HMR not working in CSS Modules](https://github.com/vitejs/vite/issues/16074)

#### Plugin compatibility

Allows other Vite plugins (e.g. PostCSS/SCSS) to process CSS Modules dependencies
- [vitejs/vite#10079: PostCSS not applied to composed styles](https://github.com/vitejs/vite/issues/10079)
- [vitejs/vite#10340: Composed SCSS file treated as CSS](https://github.com/vitejs/vite/issues/10340)

#### Improved composition handling

This plugin raises errors for missing composes dependencies and supports CSS class names that collide with JavaScript reserved keywords.
- [vitejs/vite#16075: Doesn't error on missing composes](https://github.com/vitejs/vite/issues/16075)

- [vitejs/vite#14050: Reserved keywords not allowed in CSS Modules class names](https://github.com/vitejs/vite/issues/14050)



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


### Bonus feature: strongly typed CSS Modules

This plugin can conveniently generate type definitions for CSS Modules by creating `.d.ts` files alongside the source files. For example, if `style.module.css` is imported, it will create a `style.module.css.d.ts` file next to it containing type definitions for the exported class names.

This improves the developer experience by providing type-safe class name imports, better autocompletion, and enhanced error checking directly in your editor when working with CSS Modules.

To enable this feature, pass `generateSourceTypes` to the `patchCssModules` plugin:

```ts
patchCssModules({
    generateSourceTypes: true
})
```

## API

### `patchCssModules(options)`

The `patchCssModules` function is the main method of the plugin and accepts an options object. Here are the options you can configure:

#### `options.exportMode`

- **Type**: `'both' | 'named' | 'default'`
- **Default**: `'both'`

Specifies how class names are exported from the CSS Module:

- **`both`**: Exports class names as both named and default exports.
- **`named`**: Exports class names as named exports only.
- **`default`**: Exports class names as a default export only (an object where keys are class names).

#### `options.generateSourceTypes`

- **Type**: `boolean`
- **Default**: `false`

If enabled, this option generates TypeScript `.d.ts` files for each CSS module, providing type definitions for all exported class names. This feature enhances developer experience by enabling autocompletion and type safety for imported CSS classes.


## FAQ

### What issues does this plugin address?

Vite currently processes CSS Modules by bundling each entry point separately using [`postcss-modules`](https://github.com/madyankin/postcss-modules). This approach leads to several significant problems:

1. **CSS Modules are not integrated into Vite's build process**

    Since each CSS Module is bundled in isolation, Vite plugins cannot access the dependencies resolved within them. This limitation prevents further CSS post-processing by Vite plugins, such as those handling SCSS, PostCSS, or LightningCSS transformations. Even though `postcss-modules` attempts to apply other PostCSS plugins to dependencies, it encounters issues, as reported in [Issue #10079](https://github.com/vitejs/vite/issues/10079) and [Issue #10340](https://github.com/vitejs/vite/issues/10340).

2. **Duplicated CSS Module dependencies**

    Because each CSS Module is bundled separately, shared dependencies across modules are duplicated in the final Vite build. This duplication results in larger bundle sizes and can disrupt your styles by overriding previously declared classes. This problem is documented in [Issue #7504](https://github.com/vitejs/vite/issues/7504) and [Issue #15683](https://github.com/vitejs/vite/issues/15683).

3. **Silent failures on unresolved dependencies**

    Vite (specifically, `postcss-modules`) fails silently when it cannot resolve a `composes` dependency. This means missing exports do not trigger errors, making it harder to catch CSS bugs early. This issue is highlighted in [Issue #16075](https://github.com/vitejs/vite/issues/16075).

By addressing these issues, the `vite-css-modules` plugin enhances the way Vite handles CSS Modules, integrating them seamlessly into the build process and resolving these critical problems.

### How does this work?

The plugin changes Vite's handling of CSS Modules by treating them as JavaScript modules. Here's how it achieves this:

- **Transformation into JavaScript modules**

    CSS Modules are inherently CSS files that export class names through a JavaScript interface. The plugin compiles each CSS Module into a JavaScript module that loads the CSS. In this process, `composes` statements within the CSS are transformed into JavaScript imports, and the class names are exported as JavaScript exports.

- **Integration into Vite's module graph**

    By converting CSS Modules into JavaScript modules, they become part of Vite's module graph. This integration allows Vite (and Rollup) to efficiently resolve, bundle, and de-duplicate CSS Modules and their dependencies.

- **Enhanced plugin compatibility**

    Since CSS Modules are now part of the module graph, other Vite plugins can access and process them. This resolves issues where plugins were previously unable to process dependencies within CSS Modules.

This approach mirrors how Webpack’s `css-loader` works, making it familiar to developers transitioning from Webpack. Additionally, because this method reduces the overhead in loading CSS Modules, it can offer performance improvements in larger applications.

### Does it export class names as named exports?

Yes, the plugin allows class names to be exported as named exports, but there are some considerations:

- **JavaScript variable naming limitations**

    In older versions of JavaScript, variable names cannot include certain characters like hyphens (`-`). Therefore, class names like `.foo-bar` couldn't be directly exported as `foo-bar` because it's not a valid variable name. Instead, these class names were accessible through the default export object.

- **Using `localsConvention`**

    To work around this limitation, you could use the `css.modules.localsConvention: 'camelCase'` option in Vite's configuration. This setting converts kebab-case class names to camelCase (e.g., `foo-bar` becomes `fooBar`), allowing them to be used as valid named exports.

- **ES2022 and arbitrary module namespace identifiers**

    With the introduction of ES2022, JavaScript now supports [arbitrary module namespace identifier names](https://github.com/tc39/ecma262/pull/2154). This feature allows you to export and import names with any characters, including hyphens, by enclosing them in quotes. This means class names like `.foo-bar` can be directly exported as named exports.

To use this feature, set your Vite build target to `es2022` or above in your `vite.config.js`:

```json5
{
    build: {
        target: 'es2022'
    }
}
```

You can then import class names with special characters using the following syntax:

```js
import { 'foo-bar' as fooBar } from './styles.module.css'
```

This approach lets you access all class names as named exports, even those with characters that were previously invalid in JavaScript variable names.

## Sponsors

<p align="center">
	<a href="https://github.com/sponsors/privatenumber">
		<img src="https://cdn.jsdelivr.net/gh/privatenumber/sponsors/sponsorkit/sponsors.svg">
	</a>
</p>
