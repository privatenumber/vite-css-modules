declare module 'postcss-modules-scope' {
	import { PluginCreator } from 'postcss';
	import { ClassName } from 'postcss-selector-parser';

	type GenerateScopedName = (
		name: string,
		path: string,
		css: string,
		node: ClassName,
	) => string;

	type GenerateExportEntry = (
		name: string,
		scopedName: string,
		path: string,
		css: string,
		node: ClassName,
	) => {
		key: string;
		value: string;
	};

	type Options = {
		generateScopedName?: GenerateScopedName;
		generateExportEntry?: GenerateExportEntry;
		exportGlobals?: boolean | undefined;
	};

	interface PostcssModulesScope extends PluginCreator<Options> {
		generateScopedName: GenerateScopedName;
	}

	declare const plugin: PostcssModulesScope;
	export default plugin;
}
