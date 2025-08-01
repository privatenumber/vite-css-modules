import { makeLegalIdentifier } from '@rollup/pluginutils';
import { getCssModuleUrl } from './url-utils.js';
import type { ExportMode } from './types.js';

type ImportSpecifiers = Record<string /* exportName */, string /* importAs */>;
export type Imports = Map<string /* filePath */, ImportSpecifiers>;
export type Exports = Record<string, {
	code: string;
	resolved: string;
	exportAs: Set<string>;
}>;

const importStatement = (
	specifier: string | string[],
	source: string,
) => `import ${
	Array.isArray(specifier) ? `{${specifier.join(',')}}` : specifier
} from${JSON.stringify(source)};`;

const importsToCode = (
	imports: Imports,
	exportMode: ExportMode,
	allowArbitraryNamedExports = false,
) => Array.from(imports)
	.map(
		([file, importedAs], index) => {
			const importFrom = getCssModuleUrl(file);
			if (!allowArbitraryNamedExports || exportMode !== 'named') {
				const importDefault = `cssModule${index}`;
				return `${importStatement(importDefault, importFrom)}const {${Object.entries(importedAs).map(
					([exportName, importAs]) => `${JSON.stringify(exportName)}: ${importAs}`,
				).join(',')}} = ${importDefault};`;
			}

			return importStatement(
				Object.entries(importedAs).map(
					([exportName, importAs]) => `${JSON.stringify(exportName)} as ${importAs}`,
				),
				importFrom,
			);
		},
	)
	.join('');

const exportsToCode = (
	exports: Exports,
	exportMode: ExportMode,
	allowArbitraryNamedExports = false,
) => {
	let code = '';

	const variables = new Set<string>();
	const exportedVariables = Object.entries(exports).flatMap(
		([exportName, { exportAs, code: value }]) => {
			const jsVariable = makeLegalIdentifier(exportName);
			variables.add(`const ${jsVariable} = \`${value}\`;`);

			return Array.from(exportAs).map((exportAsName) => {
				const exportNameSafe = makeLegalIdentifier(exportAsName);
				if (exportAsName !== exportNameSafe) {
					exportAsName = JSON.stringify(exportAsName);
				}
				return [jsVariable, exportAsName] as const;
			});
		},
	);

	code += Array.from(variables).join('');

	if (exportMode === 'both' || exportMode === 'named') {
		const namedExports = `export {${
			exportedVariables
				.map(
					([jsVariable, exportName]) => {
						if (
							exportName === '"default"'
							&& exportMode === 'both'
						) {
							return;
						}

						return (
							jsVariable === exportName
								? jsVariable
								: (
									exportName[0] !== '"' || allowArbitraryNamedExports
										? `${jsVariable} as ${exportName}`
										: ''
								)
						);
					},
				)
				.filter(Boolean)
				.join(',')
		}};`;
		code += namedExports;
	}

	if (exportMode === 'both' || exportMode === 'default') {
		const defaultExports = `export default{${
			exportedVariables.map(
				([jsVariable, exportName]) => (
					jsVariable === exportName
						? jsVariable
						: `${exportName}: ${jsVariable}`
				),
			).join(',')
		}}`;

		code += defaultExports;
	}

	return code;
};

export const generateEsm = (
	imports: Imports,
	exports: Exports,
	exportMode: ExportMode,
	allowArbitraryNamedExports = false,
) => (
	importsToCode(imports, exportMode, allowArbitraryNamedExports)
	+ exportsToCode(exports, exportMode, allowArbitraryNamedExports)
);
