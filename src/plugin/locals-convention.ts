import camelCase from 'lodash.camelcase';
import type { CSSModulesOptions } from 'vite';
import type { CSSModulesConfig } from 'lightningcss';

type Config = CSSModulesOptions | CSSModulesConfig;

export type LocalsConventionFunction = (
	originalClassName: string,
	generatedClassName: string,
	inputFile: string,
) => string;

export const shouldKeepOriginalExport = (
	cssModuleConfig: Config,
) => !(
	'localsConvention' in cssModuleConfig
	&& (
		typeof cssModuleConfig.localsConvention === 'function'
		|| cssModuleConfig.localsConvention === 'camelCaseOnly'
		|| cssModuleConfig.localsConvention === 'dashesOnly'
	)
);

// From:
// https://github.com/madyankin/postcss-modules/blob/325f0b33f1b746eae7aa827504a5efd0949022ef/src/localsConvention.js#L3-L5
const dashesCamelCase = (
	string: string,
) => string.replaceAll(/-+(\w)/g, (_, firstLetter) => firstLetter.toUpperCase());

export const getLocalesConventionFunction = (
	config: Config,
): LocalsConventionFunction | undefined => {
	if (!('localsConvention' in config)) {
		return;
	}

	const { localsConvention } = config;
	if (
		!localsConvention
		|| typeof localsConvention === 'function'
	) {
		return localsConvention;
	}

	if (
		localsConvention === 'camelCase'
		|| localsConvention === 'camelCaseOnly'
	) {
		return camelCase;
	}

	if (
		localsConvention === 'dashes'
		|| localsConvention === 'dashesOnly'
	) {
		return dashesCamelCase;
	}
};
