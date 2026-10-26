import path from 'node:path';
import { createFixture } from 'fs-fixture';
import type { Result, SubprocessError } from 'nano-spawn';
import { node } from './node.ts';

const cliPath = path.resolve('dist/cli/index.mjs');
export const cli = (
	args: string[],
	cwd: string,
	options?: {
		env?: NodeJS.ProcessEnv;
	},
): Promise<Result & { exitCode?: number }> => node([cliPath, ...args], {
	cwd,
	env: {
		...process.env,
		...options?.env,
	},
}).catch((error: SubprocessError) => error);

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

export const cliWithImportTrace = async (
	args: string[],
	cwd: string,
) => {
	await using traceDirectory = await createFixture();
	const traceLogPath = path.join(traceDirectory.path, 'import-trace.log');
	const result: Result & { exitCode?: number } = await node(['--import', traceHookUrl, cliPath, ...args], {
		cwd,
		env: {
			...process.env,
			IMPORT_TRACE_LOG: traceLogPath,
		},
	}).catch((error: SubprocessError) => error);
	const trace = await traceDirectory.readFile('import-trace.log', 'utf8');
	if (trace.length === 0) {
		throw new Error('CLI import trace is empty');
	}
	const resolutionAttempts = trace.trimEnd().split('\n');
	return {
		...result,
		resolutionAttempts,
	};
};
