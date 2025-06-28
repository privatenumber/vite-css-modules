import outdent from 'outdent';

const random255 = () => Math.floor(Math.random() * 256);

export const newRgb = () => `rgb(${random255()}, ${random255()}, ${random255()})`;

export const emptyCssModule = Object.freeze({
	'index.js': outdent`
	export * from './style.module.css';
	export { default } from './style.module.css';
	`,
	'style.module.css': '',
});

/**
 * PostCSS plugin that adds a "--file" CSS variable to indicate PostCSS
 * has been successfully applied
 */
const postcssConfig = outdent`
const path = require('path');
const postcss = require('postcss');
module.exports = {
	plugins: [
		(root) => {
			const newRule = postcss.rule({ selector: ':root' });
			newRule.append({
				prop: '--file',
				value: JSON.stringify(path.basename(root.source.input.file)),
			});
			root.append(newRule);
		},
	],
};
`;

export const postcssLogFile = Object.freeze({
	'postcss.config.js': postcssConfig,
});

export const multiCssModules = Object.freeze({
	'index.js': outdent`
	export * as style1 from './style1.module.css';
	export * as style2 from './style2.module.css';
	`,

	'style1.module.css': outdent`
	.className1 {
		composes: util-class from './utils1.css';
		color: red;
	}

	.class-name2 {
		composes: util-class from './utils1.css';
		composes: util-class from './utils2.css';
	}
	`,

	'style2.module.css': outdent`
	.class-name2 {
		composes: util-class from './utils1.css';
		color: red;
	}
	`,

	'utils1.css': outdent`
	.util-class {
		--name: 'foo';
		color: blue;
	}

	.unused-class {
		color: yellow;
	}
	`,
	'utils2.css': outdent`
	.util-class {
		--name: 'bar';
		color: green;
	}
	`,
});

export const reservedKeywords = Object.freeze({
	'index.js': outdent`
	export * as style from './style.module.css';
	`,

	'style.module.css': outdent`
	.import {
		composes: if from './utils.css';
		color: red;
	}

	.export {
		composes: with from './utils.css';
	}
	
	.default {
		color: blue;
	}
	`,

	'utils.css': outdent`
	.if {
		--name: 'foo';
		color: blue;
	}

	.with {
		color: yellow;
	}
	`,
});

export const exportModeBoth = Object.freeze({
	'index.js': outdent`
	export * as style from './style.module.css';
	`,

	'style.module.css': outdent`
	.class {
		composes: util from './utils.css';
		color: red;
	}
	`,

	'utils.css': outdent`
	.util {
		--name: 'foo';
		color: blue;
	}
	`,
});

export const defaultAsComposedName = Object.freeze({
	'index.js': outdent`
	export * as style from './style.module.css';
	`,

	'style.module.css': outdent`
	.typeof {
		composes: default from './utils.css';
		color: red;
	}
	`,

	'utils.css': outdent`
	.default {
		--name: 'foo';
		color: blue;
	}
	`,
});

export const defaultAsName = Object.freeze({
	'index.js': outdent`
	export * as style from './style.module.css';
	`,

	'style.module.css': outdent`
	.typeof {
		color: red;
	}

	.default {
		color: blue;
	}
	`,
});

export const cssModulesValues = Object.freeze({
	'index.js': outdent`
	export * from './style.module.css';
	export { default } from './style.module.css';
	`,

	'style.module.css': outdent`
	@value primary as p1, simple-border from './utils1.css';
	@value primary as p2 from './utils2.css';

	.class-name1 {
		color: p1;
		border: simple-border;
		composes: util-class from './utils1.css';
		composes: util-class from './utils2.css';
	}
	.class-name2 {
		color: p2;
	}
	`,

	'utils1.css': outdent`
	@value primary: #fff;
	@value simple-border: 1px solid black;

	.util-class {
		border: primary;
	}
	`,
	'utils2.css': outdent`
	@value primary: #000;

	.util-class {
		border: primary;
	}
	`,

	...postcssLogFile,
});

export const cssModulesValuesMultipleExports = Object.freeze({
	'index.js': outdent`
	export * from './style.module.css';
	export * from './style2.module.css';
	`,

	'style.module.css': outdent`
	@value primary as p1, simple-border from './style2.module.css';

	.class-name1 {
		color: p1;
		border: simple-border;
		composes: class-name2 from './style2.module.css';
	}
	`,

	'style2.module.css': outdent`
	@value primary: #fff;
	@value simple-border: 1px solid black;

	.class-name2 {
		border: primary;
	}
	`,

	...postcssLogFile,
});

export const cssModulesValueClassReferences = Object.freeze({
	'index.js': outdent`
	export * from './style.module.css';
	export * from './style2.module.css';
	`,

	'style.module.css': outdent`
	@value class-name2 from './style2.module.css';

	.class-name1 {
		color: #000;
	}
	.class-name1 .class-name2 {
		color: p2;
		border: #000
	}
	`,

	'style2.module.css': outdent`

	.class-name2 {
		border: #fff;
	}
	`,

	...postcssLogFile,
});

export const lightningCustomPropertiesFrom = Object.freeze({
	'index.js': outdent`
	export { default as style1 } from './style1.module.css';
	export { default as style2 } from './style2.module.css';
	`,

	'style1.module.css': outdent`
	.button {
		background: var(--accent-color from "./vars.module.css");
	}
	`,

	'style2.module.css': outdent`
	.input {
		color: var(--accent-color from "./vars.module.css");
	}
	`,

	'vars.module.css': outdent`
	:root {
		--accent-color: hotpink;
	}
	`,
});

export const lightningFeatures = Object.freeze({
	'index.js': outdent`
	export * from './style.module.css';
	export { default } from './style.module.css';
	`,

	'style.module.css': outdent`
	.button {
		&.primary {
			color: red;
		}
	}
	`,
});

export const scssModules = Object.freeze({
	'index.js': outdent`
	export * from './style.module.scss';
	export { default } from './style.module.scss';
	`,

	'style.module.scss': outdent`
	$primary: #cc0000;

	// comment

	.text-primary {
		color: $primary;
	}
	`,

	...postcssLogFile,
});

export const mixedScssModules = Object.freeze({
	'index.js': outdent`
	export * from './css.module.css';
	export { default } from './css.module.css';
	`,

	'css.module.css': outdent`
	.text-primary {
		composes: text-primary from './scss.module.scss';
	}
	`,

	'scss.module.scss': outdent`
	$primary: #cc0000;

	// comment

	.text-primary {
		color: $primary;
	}
	`,

	...postcssLogFile,
});

export const inlineCssModules = Object.freeze({
	'index.js': outdent`
	export * from './style.module.css?inline';
	export { default } from './style.module.css?inline';
	`,

	'style.module.css': outdent`
	.class-name1 {
		composes: util-class from './utils.css';
		color: red;
	}
	`,

	'utils.css': outdent`
	.util-class {
		--name: 'foo';
		color: blue;
	}

	.unused-class {
		color: yellow;
	}
	`,

	...postcssLogFile,
});

export const globalModule = Object.freeze({
	'index.js': outdent`
	export * from './global.module.css';
	export { default } from './global.module.css';
	`,

	'global.module.css': outdent`
	.page {
		padding: 20px;
	}
	:local(.title) {
		color: green;
	}
	`,
});

export const missingClassExport = Object.freeze({
	'index.js': outdent`
	export * from './style.module.css';
	export { default } from './style.module.css';
	`,

	'style.module.css': outdent`
	.className1 {
		composes: non-existent from './utils.css';
		color: red;
	}
	`,

	'utils.css': '',
});

export const vue = Object.freeze({
	'index.js': outdent`
	export { default as Comp } from './comp.vue';
	`,

	'comp.vue': outdent`
	<template>
		<p :class="$style['css-module']">&lt;css&gt; module</p>
	</template>

	<style module>
	.css-module {
		composes: util-class from './utils.css';
		color: red;
	}
	</style>
	`,

	'utils.css': outdent`
	.util-class {
		--name: 'foo';
		color: blue;
	}

	.unused-class {
		color: yellow;
	}
	`,

	...postcssLogFile,
});

export const moduleNamespace = Object.freeze({
	'index.js': outdent`
	import('./style.module.css');
	`,

	'style.module.css': outdent`
	.class-name {
		color: red;
	}
	`,
});

export const requestQuery = Object.freeze({
	'index.js': outdent`
	export * as style from './style.module.css?some-query';
	`,

	'style.module.css': outdent`
	.class-name {
		composes: util-class from './utils.css?another-query';
	}
	`,

	'utils.css': outdent`
	.util-class {
		--name: 'foo';
		color: blue;
	}
	`,

	...postcssLogFile,
});

export const viteDev = Object.freeze({
	...multiCssModules,
	'index.html': `
	<!DOCTYPE html>
	<html>
		<body>
			<div id="app"></div>
			<script type="module" src="/main.js"></script>
		</body>
	</html>
	`,
	'main.js': `
	import style from './style1.module.css';

	document.querySelector('#app').innerHTML =\`
	<div id="myText" class="\${style.className1}">
		Hello world
	</div>
	\`;
	`,
});

export const viteDevOutsideRoot = Object.freeze({
	...multiCssModules,
	'nested-dir': {
		'index.html': `
		<!DOCTYPE html>
		<html>
			<body>
				<div id="app"></div>
				<script type="module" src="/main.js"></script>
			</body>
		</html>
		`,
		'main.js': `
		import style from '../style1.module.css';

		document.querySelector('#app').innerHTML =\`
		<div id="myText" class="\${style.className1}">
			Hello world
		</div>
		\`;
		`,
	},
});
