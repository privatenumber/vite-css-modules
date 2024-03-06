import type { SourceMap } from 'rollup';

export const getCssSourceMaps = (
	code: string,
) => {
	const cssSourcemaps = Array.from(code.matchAll(/\/*# sourceMappingURL=data:application\/json;base64,(.+?) \*\//g));

	const maps = cssSourcemaps.map(
		([, base64]) => JSON.parse(
			Buffer.from(base64!, 'base64').toString('utf8'),
		) as SourceMap,
	);

	maps.sort((a, b) => a.sources[0]!.localeCompare(b.sources[0]!));

	return maps;
};
