import path from 'node:path';
import { on } from 'node:events';
import spawn, { type Options, type Result, type SubprocessError } from 'nano-spawn';

const node = (
	args: string[],
	options: Options,
) => spawn(process.execPath, args, options);

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
import { registerHooks } from 'node:module';

let pendingSends = 0;
let closing = false;
const send = (message) => {
	pendingSends += 1;
	process.channel?.ref();
	process.send(message, (error) => {
		pendingSends -= 1;
		if (error) {
			console.error(error);
			process.exitCode = 1;
			if (process.connected) {
				process.disconnect();
			}
			return;
		}
		if (pendingSends === 0) {
			if (closing && process.connected) {
				process.disconnect();
			} else {
				process.channel?.unref();
			}
		}
	});
};

registerHooks({
	resolve(specifier, context, nextResolve) {
		send({ type: 'resolve', specifier });
		return nextResolve(specifier, context);
	},
});
send({ type: 'ready' });

// Pending sends keep the channel referenced until their callbacks complete.
process.once('beforeExit', () => {
	if (process.connected) {
		closing = true;
		send({ type: 'complete' });
	}
});
`;
const traceHookUrl = `data:text/javascript,${encodeURIComponent(traceHookSource)}`;
type TraceMessage = { type: 'ready' } | { type: 'complete' } | {
	type: 'resolve';
	specifier: string;
};

export const cliWithImportTrace = async (
	args: string[],
	cwd: string,
) => {
	const subprocess = node(['--import', traceHookUrl, cliPath, ...args], {
		cwd,
		env: process.env,
		stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
	});
	const processResult: Promise<Result & { exitCode?: number }> = subprocess
		.catch((error: SubprocessError) => error);
	const child = await subprocess.nodeChildProcess;
	const resolutionAttempts: string[] = [];
	let ready = false;
	let complete = false;
	for await (const [message] of on(child, 'message', { close: ['disconnect'] })) {
		const traceMessage = message as TraceMessage;
		if (traceMessage.type === 'ready') {
			ready = true;
		} else if (traceMessage.type === 'complete') {
			complete = true;
		} else {
			resolutionAttempts.push(traceMessage.specifier);
		}
	}
	const result = await processResult;
	if (!ready || !complete) {
		throw new Error(`CLI import tracing ${ready ? 'did not complete' : 'was not ready'}: ${result.stderr}`);
	}
	return Object.assign(result, { resolutionAttempts });
};
