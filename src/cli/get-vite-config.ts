import { resolveConfig, type CSSModulesOptions } from 'vite';
import type { ExportMode } from '../plugin/types.js';

type PluginOptions = {
	isCssModulesDisabled: boolean;
	generateSourceTypes?: boolean;
	exportMode: ExportMode;
	cssModulesOptions?: CSSModulesOptions | false;
};

/*
 * Config capture mechanism for CLI to access plugin configuration.
 *
 * This uses process.env because Vite's resolveConfig() prevents closure sharing:
 *
 * - Vite 5: Bundles config with esbuild, creating separate code that doesn't share closures
 * - Vite 6/7: Even with configLoader: 'native', config may load CJS version while CLI uses ESM
 *
 * Since module-level variables cannot be shared between bundled code or different module formats
 * (ESM vs CJS), process.env is the most reliable method to pass state within the same process.
 */

const ENV_VAR = 'VITE_CSS_MODULES_CAPTURE';

export const isConfigCaptureEnabled = () => process.env[ENV_VAR] === '1';

export const captureConfig = (config: PluginOptions) => {
	process.env[`${ENV_VAR}_DATA`] = JSON.stringify(config);
};

export const getViteConfig = async (
	root?: string,
	configFile?: string,
) => {
	process.env[ENV_VAR] = '1';
	delete process.env[`${ENV_VAR}_DATA`];

	const viteConfig = await resolveConfig(
		{
			root: root ?? process.cwd(),
			configFile,
		},
		'build',
		'production',
		'production',
	);

	const data = process.env[`${ENV_VAR}_DATA`];
	if (!data) {
		throw new Error(
			'Failed to capture vite-css-modules config. Ensure the plugin is configured in your Vite config',
		);
	}

	const pluginOptions = JSON.parse(data) as PluginOptions;
	return {
		viteConfig,
		pluginOptions,
	};
};
