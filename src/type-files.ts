import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inspect } from 'node:util';

const cacheFingerprintPattern = /^ \* Hash: ([a-f0-9]{16})$/m;
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

export const createTypeFileConfigFingerprint = async (
	mode: string,
	configPath?: string,
	configDependencies: string[] = [],
	fallbackConfig?: unknown,
) => {
	const hash = createHash('sha256');
	hash.update('vite-css-modules-cli-cache-v1');
	hash.update('\0');
	hash.update(mode);
	hash.update('\0');

	if (configPath) {
		const configDirectory = path.dirname(configPath);
		const fingerprintFiles = [...new Set([
			configPath,
			...configDependencies,
		])].toSorted();

		for (const dependencyPath of fingerprintFiles) {
			hash.update(path.relative(configDirectory, dependencyPath));
			hash.update('\0');
			hash.update(await fs.readFile(dependencyPath, 'utf8'));
			hash.update('\0');
		}
	} else {
		hash.update(inspect(fallbackConfig, {
			depth: Infinity,
			sorted: true,
		}));
		hash.update('\0');
	}

	return hash.digest('hex');
};

export const createTypeFileFingerprint = (
	sourceCode: string,
	configFingerprint: string,
	declarationMap: boolean,
) => createHash('sha256')
	.update('vite-css-modules-cli-cache-v1')
	.update('\0')
	.update(configFingerprint)
	.update('\0')
	.update(declarationMap ? '1' : '0')
	.update('\0')
	.update(sourceCode)
	.digest('hex')
	.slice(0, 16);

export const formatTypeFileFingerprintLine = (
	fingerprint: string,
) => `Hash: ${fingerprint}`;

export const readTypeFileCache = async (
	dtsPath: string,
	sourceMapMode: 'external' | 'inline',
) => {
	const dts = await fs.readFile(dtsPath, 'utf8').catch(() => null);
	if (!dts) {
		return;
	}

	const match = dts.match(cacheFingerprintPattern);
	if (!match?.[1]) {
		return;
	}

	const hasInlineSourceMap = dts.includes('sourceMappingURL=data:');
	const hasExternalSourceMap = !hasInlineSourceMap && dts.includes('sourceMappingURL=');
	if (hasInlineSourceMap && sourceMapMode === 'external') {
		return;
	}

	if (hasExternalSourceMap) {
		if (sourceMapMode === 'inline') {
			return;
		}

		const dtsMapPath = `${dtsPath}.map`;
		const hasMap = await fs.access(dtsMapPath).then(() => true, () => false);
		if (!hasMap) {
			return;
		}
	}

	return {
		fingerprint: match[1],
		hasSourceMap: hasInlineSourceMap || hasExternalSourceMap,
	};
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
