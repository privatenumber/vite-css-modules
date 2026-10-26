import spawn, { type Options } from 'nano-spawn';

export const node = (
	args: string[],
	options: Options,
) => spawn(process.execPath, args, options);
