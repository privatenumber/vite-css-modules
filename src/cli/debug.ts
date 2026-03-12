import path from 'node:path';
import { formatWithOptions } from 'node:util';

const escapeRegExp = (value: string) => value.replaceAll(/[|\\{}()[\]^$+?.*]/g, String.raw`\$&`);

const debugPatterns = process.env.DEBUG
	?.split(',')
	.map(pattern => pattern.trim())
	.filter(Boolean)
	.map(pattern => new RegExp(`^${escapeRegExp(pattern).replaceAll(String.raw`\*`, '.*')}$`))
	?? [];

export const createDebug = (namespace: string) => {
	const enabled = debugPatterns.some(pattern => pattern.test(namespace));

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
		return filePath;
	}

	const relativePath = path.relative(cwd, filePath);
	return relativePath || '.';
};
