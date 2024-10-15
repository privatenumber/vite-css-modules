import { makeLegalIdentifier } from '@rollup/pluginutils';

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
	allowArbitraryNamedExports = false,
) => Array.from(imports)
	.map(
		([file, importedAs], index) => {
			const importFrom = `${file}?.module.css`;
			if (allowArbitraryNamedExports) {
				return importStatement(
					Object.entries(importedAs).map(
						([exportName, importAs]) => `${JSON.stringify(exportName)} as ${importAs}`,
					),
					importFrom,
				);
			}

			const importDefault = `cssModule${index}`;
			return `${importStatement(importDefault, importFrom)}const {${Object.entries(importedAs).map(
				([exportName, importAs]) => `${JSON.stringify(exportName)}: ${importAs}`,
			).join(',')}} = ${importDefault};`;
		},
	)
	.join('');

const exportsToCode = (
	exports: Exports,
	allowArbitraryNamedExports = false,
) => {
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

	const namedExports = `export {${
		exportedVariables
			.map(
				([jsVariable, exportName]) => (
					jsVariable === exportName
						? jsVariable
						: (
							exportName[0] !== '"' || allowArbitraryNamedExports
								? `${jsVariable} as ${exportName}`
								: ''
						)
				),
			)
			.filter(Boolean)
			.join(',')
	}};`;

	const defaultExports = `export default{${
		exportedVariables.map(
			([jsVariable, exportName]) => (
				jsVariable === exportName
					? jsVariable
					: `${exportName}: ${jsVariable}`
			),
		).join(',')
	}}`;

	return `${Array.from(variables).join('')}${namedExports}${defaultExports}`;
};

export const generateEsm = (
	imports: Imports,
	exports: Exports,
	allowArbitraryNamedExports = false,
) => (
	importsToCode(imports, allowArbitraryNamedExports)
	+ exportsToCode(exports, allowArbitraryNamedExports)
);

const dtsComment = `
/**
 * Generated by vite-css-modules
 * https://www.npmjs.com/vite-css-modules
 */
// @ts-nocheck
/* eslint-disable */
/* prettier-ignore */
`.trim();

export const generateTypes = (
	exports: Exports,
	allowArbitraryNamedExports = false,
) => {
	const variables = new Set<string>();
	const exportedVariables = Object.entries(exports).flatMap(
		([exportName, { exportAs }]) => {
			const jsVariable = makeLegalIdentifier(exportName);
			variables.add(`const ${jsVariable}: string;`);

			return Array.from(exportAs).map((exportAsName) => {
				const exportNameSafe = makeLegalIdentifier(exportAsName);
				if (exportAsName !== exportNameSafe) {
					exportAsName = JSON.stringify(exportAsName);
				}
				return [jsVariable, exportAsName] as const;
			});
		},
	);

	const namedExports = `export {\n${
		exportedVariables
			.map(
				([jsVariable, exportName]) => (
					jsVariable === exportName
						? '\t' + jsVariable
						: (
							exportName[0] !== '"' || allowArbitraryNamedExports
								? `\t${jsVariable} as ${exportName}`
								: ''
						)
				),
			)
			.filter(Boolean)
			.join(',\n')
	}\n};`;

	const defaultExports = `export default {\n${
		exportedVariables.map(
			([jsVariable, exportName]) => '\t' + (
				jsVariable === exportName
					? jsVariable
					: `${exportName}: ${jsVariable}`
			),
		).join(',\n')
	}\n}`;

	return `${dtsComment}\n${Array.from(variables).join('\n')}\n\n${namedExports}\n\n${defaultExports}\n`;
};
