export const base64Module = (
	code: string,
) => `data:text/javascript;base64,${
	Buffer.from(code).toString('base64')
}`;
