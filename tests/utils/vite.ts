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
		logLevel: 'warn',
		...config,

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
			...config?.build,
		},
	});

	if (!Array.isArray(built)) {
		throw new TypeError('Build result is not an array');
	}

	const { output } = built[0]!;
	const css = output.find(file => file.type === 'asset' && file.fileName.endsWith('.css'));

	if (
		css
		&& (
			css.type !== 'asset'
			|| typeof css.source !== 'string'
		)
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
					let retry = 5;
					while (retry > 0) {
						try {
							const response = await fetch(path.join(baseUrl, id));
							return await response.text();
						} catch (error) {
							if (retry === 0) {
								throw error;
							}
						}
						retry -= 1;
					}
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

	// This adds a SIGTERM listener to process, which emits a memory leak warning
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
