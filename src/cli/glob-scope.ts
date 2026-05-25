import path from 'node:path';

export const defaultGlob = '**/*.module.{css,scss,sass}';

export type GlobScope = {
	globs: string[];
	globCwd: string;
};

export const resolveGlobScope = (
	inputGlobs: string[],
	cwd: string,
	root: string,
): GlobScope => {
	if (inputGlobs.length === 0) {
		const rootRelative = path.relative(cwd, root);
		if (rootRelative === '..' || rootRelative.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelative)) {
			throw new Error(`Resolved Vite root is outside the current working directory: ${root}\nPass explicit globs to control the search scope.`);
		}

		return {
			globs: [defaultGlob],
			globCwd: root,
		};
	}

	return {
		globs: inputGlobs,
		globCwd: cwd,
	};
};
