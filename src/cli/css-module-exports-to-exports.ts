import type { LocalsConventionFunction } from '../plugin/locals-convention.js';
import type { Exports } from '../plugin/generate-esm.js';
import type { ClassComposition, CSSModuleExports } from '../plugin/transformers/postcss/types.js';

type ResolveComposition = (
	composition: ClassComposition,
) => string | undefined;

export const cssModuleExportsToExports = (
	cssModuleExports: CSSModuleExports,
	filePath: string,
	keepOriginalExport: boolean,
	localsConventionFunction?: LocalsConventionFunction,
	resolveComposition?: ResolveComposition,
): Exports => {
	const exports: Exports = {};
	const resolving = new Set<string>();

	const resolveExport = (
		exportName: string,
	) => {
		const existing = exports[exportName];
		if (existing) {
			return existing;
		}

		const exported = cssModuleExports[exportName];
		if (!exported) {
			return;
		}

		if (resolving.has(exportName)) {
			return;
		}

		resolving.add(exportName);

		const exportAs = new Set<string>();
		if (keepOriginalExport) {
			exportAs.add(exportName);
		}

		let resolved: string;
		if (typeof exported === 'string') {
			const transformedExport = localsConventionFunction?.(exportName, exported, filePath);
			if (transformedExport) {
				exportAs.add(transformedExport);
			}
			resolved = exported;
		} else {
			const transformedExport = localsConventionFunction?.(exportName, exported.name, filePath);
			if (transformedExport) {
				exportAs.add(transformedExport);
			}

			const composedNames = exported.composes.map((composition) => {
				if (composition.type === 'local') {
					return resolveExport(composition.name)?.resolved ?? composition.name;
				}

				return resolveComposition?.(composition) ?? composition.name;
			});
			resolved = [exported.name, ...composedNames].join(' ');
		}

		exports[exportName] = {
			code: resolved,
			resolved,
			exportAs,
		};
		resolving.delete(exportName);

		return exports[exportName];
	};

	for (const exportName of Object.keys(cssModuleExports)) {
		resolveExport(exportName);
	}

	return exports;
};
