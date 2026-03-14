import path from 'node:path';
import { slash } from '../plugin/url-utils.js';

export const formatDebugPath = (
	filePath: string,
	cwd = process.cwd(),
) => {
	if (!path.isAbsolute(filePath)) {
		return slash(filePath);
	}

	const relativePath = path.relative(cwd, filePath);
	return slash(relativePath || '.');
};
