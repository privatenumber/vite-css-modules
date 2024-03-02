# vite-css-modules <a href="https://npm.im/vite-css-modules"><img src="https://badgen.net/npm/v/vite-css-modules"></a> <a href="https://npm.im/vite-css-modules"><img src="https://badgen.net/npm/dm/vite-css-modules"></a>

This Vite plugin fixes several CSS Module bugs by handling CSS Modules as JS Modules.

The goal of this project is to incorporate this fix directly into Vite ([PR #16018](https://github.com/vitejs/vite/pull/16018)). Meanwhile, this plugin is published for early adopters and users who are unable to upgrade Vite.


### Improvements
- **Handle CSS Modules as JS Modules**

    The plugin changes how Vite processes CSS Modules. Currently, Vite bundles each CSS Module entry-point separately using [postcss-modules](https://github.com/madyankin/postcss-modules).

    By treating them as JavaScript modules, they can now be integrated into Vite's module graph, allowing Vite to handle the bundling. This allows:

    - CSS Module dependencies to be de-duplicated (fix [#7504](https://github.com/vitejs/vite/issues/7504), [#15683](https://github.com/vitejs/vite/issues/15683))
    - HMR in CSS Module dependencies (fix [#16074](https://github.com/vitejs/vite/issues/16074))
    - Vite plugins to process individual CSS Modules (fix [#10079](https://github.com/vitejs/vite/issues/10079), [#10340](https://github.com/vitejs/vite/issues/10340))

- **Improved error handling**

    Currently, Vite (or more specifically, `postcss-modules`) fails silently when unable to resolve a `composes` dependency. This plugin will throw an error, helping you catch bugs. (fix [#16075](https://github.com/vitejs/vite/issues/16075))

For more details, see the [FAQ](#faq) below.

## Install
```sh
npm install -D vite-css-modules
```

## Setup

In `vite.config.js`:

```ts
import { patchCssModules } from 'vite-css-modules'

export default {
    plugins: [
        patchCssModules()

        // Other plugins
    ],

    css: {
        // Configure CSS Modules as you previously did
        modules: {
            // ...
        },

        // Or LightningCSS
        lightningcss: {
            cssModules: {
                // ...
            }
        }
    }
}
```

This patches your Vite to handle CSS Modules in a more predictable way.


## FAQ

### What issues does this plugin address?
Vite uses [`postcss-modules`](https://github.com/madyankin/postcss-modules) to create a separate  bundle for each CSS Module entry point, which leads to the following problems:


1. **CSS Modules are not integrated with the Vite build**

    `postcss-modules` bundles each CSS Module entry-point in a black-box, preventing Vite plugins from accessing any of the dependencies it resolves. This effectively limits further CSS post-processing from Vite plugins (e.g. SCSS, PostCSS, or LightningCSS). 
    
    Although `postcss-modules` tries to apply other PostCSS plugins to dependencies, it seems to have issues:
    
    - https://github.com/vitejs/vite/issues/10079
    - https://github.com/vitejs/vite/issues/10340


2. **Duplicated CSS Module dependencies**

    Since each CSS Module is bundled separately at each entry-point, dependencies shared across those entry-points are duplicated in the final Vite build.
    
    This leads to bloated final outputs, and the duplicated composed classes can disrupt the intended style by overriding previously declared classes.

    - https://github.com/vitejs/vite/issues/7504
    - https://github.com/vitejs/vite/issues/15683


### How does this work?

#### Plugin

Inherently, CSS Modules are CSS files with a JavaScript interface exporting the class names.

This plugin preserves their nature and compiles each CSS Module into an JS module that loads the CSS. In each CSS Module, the `composes` are transformed into JavaScript imports, and the exports consist of the class names. This allows Vite (or Rollup) to efficiently resolve, bundle, and de-duplicate the CSS Modules.

This process mirrors the approach taken by Webpack’s `css-loader`, making it easier for those transitioning from Webpack. And since this technically does less work to load CSS Modules, I'm sure it's marginally faster in larger apps.

#### Patch
The patch disables Vite's default CSS Modules behavior, injects this plugin right before Vite's `vite:css-post` plugin, and patches the `vite:css-post` plugin to handle the JS output from the plugin.
