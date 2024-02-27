import { makeLegalIdentifier } from '@rollup/pluginutils';

type ImportSpecifiers = Record<string /* exportName */, string /* importAs */>;
export type Imports = Map<string /* filePath */, ImportSpecifiers>;
export type Exports = Record<string, string>;

const importStatement = (
	specifiers: string,
	source: string,
) => `import${specifiers ? `{${specifiers}}from` : ''}${JSON.stringify(source)};`;

const importsToCode = (
	imports: Imports,
) => (
	Array.from(imports)
		.map(
			([file, importedAs]) => importStatement(
				Object.entries(importedAs).map(
					([exportName, importAs]) => `${JSON.stringify(exportName)} as ${importAs}`,
				).join(','),
				`${file}?.module.css`,
			),
		)
		.join('')
);

const exportsToCode = (
	exports: Exports,
) => {
	const variables = new Set<string>();
	const exportedVariables = Object.entries(exports).map(
		([exportName, value]) => {
			const jsVariable = makeLegalIdentifier(exportName);
			const valueDecl = `const ${jsVariable} = \`${value}\`;`;
			variables.add(valueDecl);

			if (exportName !== jsVariable) {
				exportName = JSON.stringify(exportName);
			}
			return [jsVariable, exportName] as const;
		},
	);

	const namedExports = `export {${
		exportedVariables
			.map(
				([jsVariable, exportName]) => (
					jsVariable === exportName
						? jsVariable
						: `${jsVariable} as ${exportName}`
				),
			)
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
) => importsToCode(imports) + exportsToCode(exports);
