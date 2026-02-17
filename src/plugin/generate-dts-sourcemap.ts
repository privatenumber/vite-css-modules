import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { encode, type SourceMapSegment, type SourceMapMappings } from '@jridgewell/sourcemap-codec';

type Position = {
	line: number;
	column: number;
};

export type MappedLine = {
	text: string;
	mapping?: {
		variableName: string;
		column: number;
	};
};

export type SourceMapOptions = {
	sourceFileName: string;
	classPositions: Map<string, Position>;
};

/*
 * Convert a character offset within a selector string to a file-level position.
 *
 * PostCSS rule.source.start gives the file-level position of the selector's
 * first character. This walks from there through the selector, counting newlines
 * to compute the file-level position at the given offset.
 */
const offsetToPosition = (
	ruleStart: {
		line: number;
		column: number;
	},
	selector: string,
	offset: number,
): Position => {
	let { line, column } = ruleStart;

	for (let i = 0; i < offset; i += 1) {
		if (selector[i] === '\n') {
			line += 1;
			column = 1;
		} else {
			column += 1;
		}
	}

	return {
		line,
		column,
	};
};

const parser = selectorParser();

/*
 * Find the file-level position of each CSS class selector in the source.
 *
 * Returns a map of className → position of the '.' in the selector.
 * Uses PostCSS for rule-level parsing and postcss-selector-parser
 * for robust class extraction (handles escapes, unicode, etc.).
 */
export const findClassPositions = (
	css: string,
	filePath: string,
): Map<string, Position> => {
	const positions = new Map<string, Position>();
	const root = postcss.parse(css, { from: filePath });

	root.walkRules((rule) => {
		if (!rule.source?.start) {
			return;
		}

		const ruleStart = rule.source.start;
		const selectorAst = parser.astSync(rule.selector);
		selectorAst.walkClasses((classNode) => {
			// Keep first occurrence as the definition site
			if (!positions.has(classNode.value)) {
				positions.set(classNode.value, offsetToPosition(
					ruleStart,
					rule.selector,
					classNode.sourceIndex,
				));
			}
		});
	});

	return positions;
};

// Number of lines in the dtsTemplate header when code is present (lines 0–7).
// Must be updated if the dtsTemplate header format changes.
const dtsHeaderLineCount = 8;

export const buildDtsSourceMap = (
	codeLines: MappedLine[],
	variableToClass: Map<string, string>,
	{ sourceFileName, classPositions }: SourceMapOptions,
) => {
	const mappings: SourceMapMappings = [];

	for (let i = 0; i < dtsHeaderLineCount; i += 1) {
		mappings.push([]);
	}

	for (const line of codeLines) {
		const segments: SourceMapSegment[] = [];
		if (line.mapping) {
			// Reverse makeLegalIdentifier to recover the original CSS class name
			const className = variableToClass.get(line.mapping.variableName);
			if (className) {
				const position = classPositions.get(className);
				if (position) {
					// PostCSS positions are 1-based; source maps use 0-based
					segments.push([
						line.mapping.column,
						0,
						position.line - 1,
						position.column - 1,
					]);
				}
			}
		}
		mappings.push(segments);
	}

	const json = JSON.stringify({
		version: 3,
		file: `${sourceFileName}.d.ts`,
		sources: [sourceFileName],
		names: [],
		mappings: encode(mappings),
	});

	return `data:application/json;charset=utf-8;base64,${Buffer.from(json).toString('base64')}`;
};
