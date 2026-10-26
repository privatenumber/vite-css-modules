import path from 'node:path';
import spawn, { type Options, type Result, type SubprocessError } from 'nano-spawn';

const node = (
	args: string[],
	options: Options,
): Promise<Result & { exitCode?: number }> => spawn(process.execPath, args, options)
	.catch((error: SubprocessError) => error);

const cliPath = path.resolve('dist/cli/index.mjs');
export const cli = (
	args: string[],
	cwd: string,
	options?: {
		env?: NodeJS.ProcessEnv;
	},
) => node([cliPath, ...args], {
	cwd,
	env: {
		...process.env,
		...options?.env,
	},
});

// Records every module specifier Node attempts to resolve while the CLI runs,
// so tests can assert an optional dependency was never even looked up.
const traceHookSource = String.raw`
import { appendFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
	resolve(specifier, context, nextResolve) {
		appendFileSync(process.env.IMPORT_TRACE_LOG, specifier + '\n');
		return nextResolve(specifier, context);
	},
});
`;
const traceHookUrl = `data:text/javascript,${encodeURIComponent(traceHookSource)}`;
export const cliWithImportTrace = (
	args: string[],
	cwd: string,
	traceLogPath: string,
) => node(
	['--import', traceHookUrl, cliPath, ...args],
	{
		cwd,
		env: {
			...process.env,
			IMPORT_TRACE_LOG: traceLogPath,
		},
	},
);
