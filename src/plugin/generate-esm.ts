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
	const defaultExportEntries: string[] = [];
	const namedExports = Object.entries(exports).map(
		([exportName, value]) => {
			const stringValue = `\`${value}\``;
			const jsVariable = makeLegalIdentifier(exportName);

			const variable = `const ${jsVariable}=${stringValue};`;
			if (exportName === jsVariable) {
				defaultExportEntries.push(jsVariable);
				return `export ${variable}`;
			}

			const exportNameString = JSON.stringify(exportName);
			defaultExportEntries.push(`${exportNameString}:${jsVariable}`);
			return `${variable}export{${jsVariable} as ${exportNameString}};`;
		},
	).join('');

	return `${namedExports}export default{${defaultExportEntries.join(',')}};`;
};

export const generateEsm = (
	imports: Imports,
	exports: Exports,
) => importsToCode(imports) + exportsToCode(exports);
