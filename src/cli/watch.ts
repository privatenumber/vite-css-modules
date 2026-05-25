/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { subscribe } from '@parcel/watcher';
import picomatch from 'picomatch';
import { slash } from '../plugin/url-utils.js';
import {
	generateDeclarationForFile,
	type CssModuleLoader,
} from './generate-declaration.js';
import type { ProjectContext } from './project-context.js';

const DEFAULT_IGNORE_DIRS = [
	'node_modules',
	'.git',
	'dist',
	'coverage',
] as const;

const DEFAULT_IGNORE_GLOBS = DEFAULT_IGNORE_DIRS.map(
	dir => `**/${dir}/**`,
);

export type RunWatchOptions = {
	globs: string[];
	globCwd: string;
	projectContext: ProjectContext;
	loadCssModule: CssModuleLoader;
	cwd: string;
	allowArbitraryNamedExports: boolean;
	hadInitialMatches: boolean;
	silent: boolean;
};

const unlinkIfExists = async (filePath: string) => {
	await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== 'ENOENT') {
			throw error;
		}
	});
};

export const runWatch = async ({
	globs,
	globCwd,
	projectContext,
	loadCssModule,
	cwd,
	allowArbitraryNamedExports,
	hadInitialMatches,
	silent,
}: RunWatchOptions): Promise<() => Promise<void>> => {
	const resolvedGlobCwd = path.resolve(globCwd);

	const globMatchers = globs.map(pattern => picomatch(pattern, { dot: true }));

	const matchesConfiguredGlobs = (absolutePath: string): boolean => {
		const relative = slash(path.relative(resolvedGlobCwd, absolutePath));
		if (
			relative === ''
			|| relative.startsWith('..')
			|| path.isAbsolute(relative)
		) {
			return false;
		}
		return globMatchers.some(matcher => matcher(relative));
	};

	const ignoreMatchers = DEFAULT_IGNORE_GLOBS.map(pattern => picomatch(pattern, { dot: true }));

	const isIgnored = (absolutePath: string): boolean => {
		const relative = slash(path.relative(resolvedGlobCwd, absolutePath));
		return ignoreMatchers.some(matcher => matcher(relative));
	};

	const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const debounce = (filePath: string, callback: () => void) => {
		clearTimeout(pendingTimers.get(filePath));
		pendingTimers.set(
			filePath,
			setTimeout(() => {
				pendingTimers.delete(filePath);
				callback();
			}, 300),
		);
	};

	const handleModify = (absolutePath: string) => {
		debounce(absolutePath, () => {
			loadCssModule.invalidate(absolutePath);
			generateDeclarationForFile(
				projectContext,
				loadCssModule,
				cwd,
				absolutePath,
				allowArbitraryNamedExports,
				silent,
				false,
			).catch((error: unknown) => {
				console.error(error);
			});
		});
	};

	const sub = await subscribe(
		resolvedGlobCwd,
		(error, events) => {
			if (error) {
				console.error(error);
				return;
			}
			for (const event of events) {
				if (isIgnored(event.path)) {
					continue;
				}
				if (!matchesConfiguredGlobs(event.path)) {
					continue;
				}

				if (event.type === 'create' || event.type === 'update') {
					handleModify(event.path);
				} else if (event.type === 'delete') {
					loadCssModule.invalidate(event.path);
					Promise.all([
						unlinkIfExists(`${event.path}.d.ts`),
						unlinkIfExists(`${event.path}.d.ts.map`),
					]).catch((unlinkError: unknown) => {
						console.error(unlinkError instanceof Error ? unlinkError.message : unlinkError);
					});
				}
			}
		},
		{
			ignore: DEFAULT_IGNORE_DIRS.map(dir => path.join(resolvedGlobCwd, dir)),
		},
	);

	if (!hadInitialMatches && !silent) {
		console.log('No files matched yet; watching for additions.');
	}
	console.log('Watching for changes...');

	return async () => {
		pendingTimers.forEach(clearTimeout);
		pendingTimers.clear();
		await sub.unsubscribe();
	};
};
/* eslint-enable no-console */
