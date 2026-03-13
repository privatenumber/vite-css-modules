import fs from 'node:fs/promises';
import path from 'node:path';

const inlineSourceMapPattern = /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)\n?$/;

const writeFileIfChanged = async (
	filePath: string,
	content: string,
) => {
	const existingContent = await fs.readFile(filePath, 'utf8').catch(() => null);
	if (existingContent !== content) {
		await fs.writeFile(filePath, content);
	}
};

export const writeTypeFiles = async (
	dtsPath: string,
	dts: string,
	sourceMapMode: 'external' | 'inline',
) => {
	const dtsMapPath = `${dtsPath}.map`;
	const inlineSourceMapMatch = dts.match(inlineSourceMapPattern);

	if (sourceMapMode === 'external' && inlineSourceMapMatch) {
		const dtsMap = Buffer.from(inlineSourceMapMatch[1]!, 'base64').toString('utf8');
		const dtsWithExternalSourceMap = dts.replace(
			inlineSourceMapPattern,
			`//# sourceMappingURL=${path.basename(dtsMapPath)}\n`,
		);

		await writeFileIfChanged(dtsPath, dtsWithExternalSourceMap);
		await writeFileIfChanged(dtsMapPath, dtsMap);

		return [
			dtsPath,
			dtsMapPath,
		];
	}

	await writeFileIfChanged(dtsPath, dts);
	await fs.unlink(dtsMapPath).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== 'ENOENT') {
			throw error;
		}
	});

	return [dtsPath];
};
