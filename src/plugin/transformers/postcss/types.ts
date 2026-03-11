/**
 * This is designed for parity with LightningCSS
 * so it they can be used as a drop-in alternative
 * https://github.com/parcel-bundler/lightningcss/blob/0c05ba8620f427e4a68bff05cfebe77bd35eef6f/node/index.d.ts#L310
 */

export type GlobalReference = {
	type: 'global';
	name: string;
};

export type LocalReference = {
	type: 'local';
	name: string;
};

export type DependencyReference = {
	type: 'dependency';
	specifier: string;
	name: string;
};

export type CSSModuleReferences = {
	[name: string]: DependencyReference;
};

type ClassExport = {
	name: string;
	composes: ClassComposition[];
};

export type ClassComposition = LocalReference | GlobalReference | DependencyReference;

export type CSSModuleExports = Record<string, string | ClassExport>;

export type Extracted = {
	exports: CSSModuleExports;
	references: CSSModuleReferences;
};
