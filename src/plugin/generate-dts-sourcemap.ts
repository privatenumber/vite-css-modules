import { encode, type SourceMapSegment, type SourceMapMappings } from '@jridgewell/sourcemap-codec';
import type { Position } from 'css-class-positions';

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

export const buildDtsSourceMap = (
	codeLines: MappedLine[],
	variableToClass: Map<string, string>,
	{ sourceFileName, classPositions }: SourceMapOptions,
	headerLineCount: number,
) => {
	const mappings: SourceMapMappings = [];

	for (let i = 0; i < headerLineCount; i += 1) {
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
					// Scanner positions are 1-based; source maps use 0-based
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
