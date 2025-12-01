import path from 'node:path';
import { createRequire } from 'node:module';
import { up } from 'empathic/find';

type SassCompiler = {
	compileString: (
		source: string,
		options?: {
			syntax?: 'scss' | 'indented';
			url?: URL;
			loadPaths?: string[];
		},
	) => { css: string };
};

// Cache sass compilers by package.json location
const sassCache = new Map<string, SassCompiler | null>();

const tryImportSass = (
	packageJsonPath: string,
): SassCompiler | undefined => {
	const cached = sassCache.get(packageJsonPath);
	if (cached !== undefined) {
		return cached ?? undefined;
	}

	try {
		const require = createRequire(packageJsonPath);
		// Try sass-embedded first (faster), then sass
		let compiler: SassCompiler;
		try {
			// eslint-disable-next-line import-x/no-unresolved
			compiler = require('sass-embedded') as SassCompiler;
		} catch {
			compiler = require('sass') as SassCompiler;
		}
		sassCache.set(packageJsonPath, compiler);
		return compiler;
	} catch {
		sassCache.set(packageJsonPath, null);
		return undefined;
	}
};

/**
 * Strip // comments from SCSS/Sass code as a fallback when sass compiler is not available.
 * Only strips full-line comments to avoid breaking strings that contain "//".
 */
const stripScssComments = (code: string): string => code
	.replaceAll(/^\s*\/\/.*$/gm, ''); // Lines that are only comments

export type CompileSassResult = {
	code: string;
	sassNotFound: boolean;
};

export const compileSass = (
	code: string,
	filePath: string,
	syntax: 'scss' | 'indented',
): CompileSassResult => {
	const packageJsonPath = up('package.json', { cwd: path.dirname(filePath) });
	const sass = packageJsonPath ? tryImportSass(packageJsonPath) : undefined;

	if (sass) {
		const absolutePath = path.resolve(filePath);
		const result = sass.compileString(code, {
			syntax,
			url: new URL(`file://${absolutePath}`),
			loadPaths: [path.dirname(absolutePath)],
		});
		return {
			code: result.css,
			sassNotFound: false,
		};
	}

	// No sass compiler - strip // comments as a fallback
	return {
		code: stripScssComments(code),
		sassNotFound: true,
	};
};
