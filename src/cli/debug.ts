import path from 'node:path';
import { formatWithOptions } from 'node:util';

const debugPrefixes = process.env.DEBUG
	?.split(',')
	.map(pattern => pattern.trim())
	.filter(Boolean)
	.map(pattern => (
		pattern.endsWith('*')
			? pattern.slice(0, -1)
			: pattern
	))
	?? [];

export const createDebug = (namespace: string) => {
	const enabled = debugPrefixes.some(prefix => namespace.startsWith(prefix));

	return (...values: unknown[]) => {
		if (!enabled) {
			return;
		}

		process.stderr.write(`${formatWithOptions({}, namespace, ...values)}\n`);
	};
};

export const formatDebugPath = (
	filePath: string,
	cwd = process.cwd(),
) => {
	if (!path.isAbsolute(filePath)) {
		return filePath.replaceAll('\\', '/');
	}

	const relativePath = path.relative(cwd, filePath);
	return (relativePath || '.').replaceAll('\\', '/');
};
