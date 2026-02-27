import type { LocalsConventionFunction } from '../plugin/locals-convention.js';
import type { Exports } from '../plugin/generate-esm.js';
import type { CSSModuleExports } from '../plugin/transformers/postcss/types.js';

export const cssModuleExportsToExports = (
	cssModuleExports: CSSModuleExports,
	filePath: string,
	keepOriginalExport: boolean,
	localsConventionFunction?: LocalsConventionFunction,
): Exports => {
	const exports: Exports = {};

	for (const [exportName, exported] of Object.entries(cssModuleExports)) {
		const exportAs = new Set<string>();
		if (keepOriginalExport) {
			exportAs.add(exportName);
		}

		let resolved: string;
		if (typeof exported === 'string') {
			const transformedExport = localsConventionFunction?.(exportName, exportName, filePath);
			if (transformedExport) {
				exportAs.add(transformedExport);
			}
			resolved = exported;
		} else {
			const transformedExport = localsConventionFunction?.(exportName, exported.name, filePath);
			if (transformedExport) {
				exportAs.add(transformedExport);
			}

			const composedNames = exported.composes.map(dep => dep.name);
			resolved = [exported.name, ...composedNames].join(' ');
		}

		exports[exportName] = {
			code: resolved,
			resolved,
			exportAs,
		};
	}

	return exports;
};
