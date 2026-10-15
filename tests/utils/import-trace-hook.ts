import { appendFileSync } from 'node:fs';

export const resolve = async (
	specifier: string,
	context: unknown,
	nextResolve: (specifier: string, context: unknown) => unknown,
) => {
	const logPath = process.env.IMPORT_TRACE_LOG;
	if (logPath) {
		appendFileSync(logPath, `${specifier}\n`);
	}
	return nextResolve(specifier, context);
};
