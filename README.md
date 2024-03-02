# vite-css-modules

This Vite plugin fixes the following CSS Module bugs: [#7504](https://github.com/vitejs/vite/issues/7504), [#10079](https://github.com/vitejs/vite/issues/10079), [#10340](https://github.com/vitejs/vite/issues/10340), & [#15683](https://github.com/vitejs/vite/issues/15683).


The goal is to incorporate this fix directly into Vite ([PR #16018](https://github.com/vitejs/vite/pull/16018)). Meanwhile, this plugin offers a path for early adopters and users who are unable to upgrade Vite.


### Improvements
- **Handle CSS Modules as JS Modules**

    The plugin changes how Vite processes CSS Modules. Currently, Vite bundles each CSS Module entry-point separately using [postcss-modules](https://github.com/madyankin/postcss-modules).

    By treating them as JavaScript modules, they can now be integrated into Vite's module graph, allowing Vite to handle the bundling and de-duplicate shared dependencies. Also allowing Vite plugins to process individual CSS Modules.

- **Improved error handling**

    Currently, Vite fails silently when unable to resolve a `composes` dependency. This plugin will throw an error, making it easier to catch bugs.

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
Vite uses [`postcss-modules`](https://github.com/madyankin/postcss-modules) to bundle CSS Modules per entry point, which leads to the following problems:


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
