import path from 'node:path';

const escapeRegExp = (value: string) => value.replaceAll(/[|\\{}()[\]^$+?.*]/g, '\\$&');

const debugPatterns = process.env.DEBUG
	?.split(',')
	.map(pattern => pattern.trim())
	.filter(Boolean)
	.map(pattern => new RegExp(`^${escapeRegExp(pattern).replaceAll('\\*', '.*')}$`))
	?? [];

export const createDebug = (namespace: string) => {
	const enabled = debugPatterns.some(pattern => pattern.test(namespace));

	return (...values: unknown[]) => {
		if (!enabled) {
			return;
		}

		console.error(namespace, ...values);
	};
};

export const formatDebugPath = (
	filePath: string,
	cwd = process.cwd(),
) => {
	if (!path.isAbsolute(filePath)) {
		return filePath;
	}

	const relativePath = path.relative(cwd, filePath);
	return relativePath || '.';
};

export const formatDurationMs = (
	durationMs: number,
) => Math.round(durationMs);
