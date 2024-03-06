export const getCssSourceMaps = (
	code: string,
) => {
	const cssSourcemaps = Array.from(code.matchAll(/\/*# sourceMappingURL=data:application\/json;base64,(.+?) \*\//g));

	return cssSourcemaps.map(
		([, base64]) => JSON.parse(
			Buffer.from(base64!, 'base64').toString('utf8'),
		),
	);
};
