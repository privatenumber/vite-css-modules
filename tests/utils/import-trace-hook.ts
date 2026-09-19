import { appendFileSync } from 'node:fs';

export async function resolve(specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => unknown) {
	const logPath = process.env['IMPORT_TRACE_LOG'];
	if (logPath) {
		appendFileSync(logPath, `${specifier}\n`);
	}
	return nextResolve(specifier, context);
}
