import path from 'path';
import fs from 'fs/promises';
import { build, createServer, type InlineConfig } from 'vite';
import { rollup } from 'rollup';

export const viteBuild = async (
	fixturePath: string,
	config?: InlineConfig,
) => {
	try {
		await fs.symlink(
			path.resolve('node_modules'),
			path.join(fixturePath, 'node_modules'),
		);
	} catch {}

	const built = await build({
		root: fixturePath,
		configFile: false,
		envFile: false,
		logLevel: 'error',

		build: {
			/**
			 * Prevents CSS minification from handling the de-duplication of classes
			 * This is a module bundling concern and should be handled by Rollup
			 * (which this plugin aims to accomplish)
			 */
			minify: false,
			outDir: 'dist',
			lib: {
				entry: 'index.js',
				formats: ['es'],
			},
			target: 'esnext',
		},
		...config,
	});

	if (!Array.isArray(built)) {
		throw new TypeError('Build result is not an array');
	}

	const { output } = built[0]!;
	const css = output[1];

	if (
		css
		&& (css.type !== 'asset'
		|| typeof css.source !== 'string')
	) {
		throw new Error('Unexpected CSS output');
	}

	return {
		js: output[0].code,
		css: css?.source.toString(),
	};
};

const collectJsFromHttp = async (
	baseUrl: string,
	input: string,
) => {
	const bundle = await rollup({
		input,
		logLevel: 'silent',
		plugins: [
			{
				name: 'vite-dev-server',
				resolveId: id => id,
				load: async (id) => {
					const response = await fetch(path.join(baseUrl, id));
					return await response.text();
				},
			},
		],
	});
	const generated = await bundle.generate({});
	return generated.output[0].code;
};

export const viteServe = async (
	fixturePath: string,
	config?: InlineConfig,
) => {
	await fs.symlink(
		path.resolve('node_modules'),
		path.join(fixturePath, 'node_modules'),
	);

	const server = await createServer({
		root: fixturePath,
		configFile: false,
		envFile: false,
		logLevel: 'error',
		server: {
			port: 9999,
		},
		...config,
	});

	await server.listen();

	const url = server.resolvedUrls!.local[0]!;
	const code = await collectJsFromHttp(url, `@fs${fixturePath}/index.js`);

	await server.close();

	return code;
};
