/*
 * Custom scanner instead of PostCSS + postcss-selector-parser because:
 *
 * 1. PostCSS fails on Sass indented syntax and Stylus — this scanner
 *    works across all CSS-like syntaxes (CSS, SCSS, Less, Sass, Stylus)
 * 2. We only need class selector positions for "Go to Definition" source
 *    maps, not a full AST — a targeted scan is simpler and faster
 * 3. Zero dependencies — avoids pulling PostCSS into the source map path
 *
 * The scanner reads CSS identifiers including escape sequences per the
 * CSS spec (https://drafts.csswg.org/css-syntax-3/#consume-escaped-code-point)
 * and compares decoded names against known CSS Modules exports.
 */

export type Position = {
	line: number;
	column: number;
};

const isAsciiHexDigit = (charCode: number | undefined): charCode is number => (
	charCode !== undefined
	&& (
		// 0-9
		(charCode >= 48 && charCode <= 57)
		// a-f
		|| (charCode >= 97 && charCode <= 102)
		// A-F
		|| (charCode >= 65 && charCode <= 70)
	)
);

const isCssWhitespace = (charCode: number | undefined): charCode is number => (
	charCode !== undefined
	&& (
		charCode === 9
		|| charCode === 10
		|| charCode === 12
		|| charCode === 13
		|| charCode === 32
	)
);

const isIdentifierChar = (charCode: number | undefined): charCode is number => (
	charCode !== undefined
	&& (
		// a-z
		(charCode >= 97 && charCode <= 122)
		// A-Z
		|| (charCode >= 65 && charCode <= 90)
		// 0-9
		|| (charCode >= 48 && charCode <= 57)
		// _ -
		|| charCode === 95
		|| charCode === 45
		// Non-ASCII (valid in CSS identifiers)
		|| charCode >= 128
	)
);

const startsWithIgnoreAsciiCase = (
	input: string,
	index: number,
	search: string,
) => {
	for (let i = 0; i < search.length; i += 1) {
		if (input[index + i]?.toLowerCase() !== search[i]) {
			return false;
		}
	}

	return true;
};

const decodeCssCodePoint = (codePoint: number) => {
	if (
		codePoint === 0
		|| codePoint > 0x10_FF_FF
		|| (codePoint >= 0xD8_00 && codePoint <= 0xDF_FF)
	) {
		return '\uFFFD';
	}

	return String.fromCodePoint(codePoint);
};

type EscapeResult = {
	value: string;
	next: number;
};

const readCssEscape = (
	css: string,
	start: number,
): EscapeResult => {
	let i = start + 1;
	const escapedCodePoint = css.codePointAt(i);
	if (escapedCodePoint === undefined) {
		return {
			value: '',
			next: i,
		};
	}

	if (isAsciiHexDigit(escapedCodePoint)) {
		let hex = '';
		let digits = 0;

		while (digits < 6 && isAsciiHexDigit(css.codePointAt(i))) {
			hex += css[i];
			i += 1;
			digits += 1;
		}

		if (isCssWhitespace(css.codePointAt(i))) {
			i += 1;
		}

		return {
			value: decodeCssCodePoint(Number.parseInt(hex, 16)),
			next: i,
		};
	}

	return {
		value: decodeCssCodePoint(escapedCodePoint),
		next: i + (escapedCodePoint > 0xFF_FF ? 2 : 1),
	};
};

type IdentifierMatch = {
	name: string;
	end: number;
};

const readCssIdentifier = (
	css: string,
	start: number,
): IdentifierMatch => {
	let i = start;
	let name = '';

	while (i < css.length) {
		if (css[i] === '\\') {
			const escape = readCssEscape(css, i);
			name += escape.value;
			i = escape.next;
			continue;
		}

		const charCode = css.codePointAt(i);
		if (!isIdentifierChar(charCode)) {
			break;
		}

		name += String.fromCodePoint(charCode);
		i += charCode > 0xFF_FF ? 2 : 1;
	}

	return {
		name,
		end: i,
	};
};

type SkipResult = {
	next: number;
	line: number;
	column: number;
};

const skipQuotedString = (
	css: string,
	start: number,
	line: number,
	column: number,
): SkipResult => {
	const quote = css[start];
	let i = start + 1;
	let currentLine = line;
	let currentColumn = column + 1;

	while (i < css.length) {
		if (css[i] === quote) {
			i += 1;
			currentColumn += 1;
			break;
		}

		if (css[i] === '\\') {
			i += 1;
			currentColumn += 1;
			if (i >= css.length) {
				break;
			}
		}

		if (css[i] === '\n') {
			currentLine += 1;
			currentColumn = 1;
		} else {
			currentColumn += 1;
		}
		i += 1;
	}

	return {
		next: i,
		line: currentLine,
		column: currentColumn,
	};
};

const skipUrlFunction = (
	css: string,
	start: number,
	line: number,
	column: number,
): SkipResult => {
	let i = start + 4;
	let currentLine = line;
	let currentColumn = column + 4;

	while (i < css.length) {
		if (css[i] === '"' || css[i] === '\'') {
			const skippedString = skipQuotedString(
				css,
				i,
				currentLine,
				currentColumn,
			);
			i = skippedString.next;
			currentLine = skippedString.line;
			currentColumn = skippedString.column;
			continue;
		}

		if (css[i] === '\\') {
			i += 1;
			currentColumn += 1;
			if (i >= css.length) {
				break;
			}
		} else if (css[i] === ')') {
			i += 1;
			currentColumn += 1;
			break;
		}

		if (css[i] === '\n') {
			currentLine += 1;
			currentColumn = 1;
		} else {
			currentColumn += 1;
		}
		i += 1;
	}

	return {
		next: i,
		line: currentLine,
		column: currentColumn,
	};
};

/*
 * Find the position of each CSS class selector in the source text.
 *
 * Returns a map of className → position of the '.' in the selector.
 * Uses a character-by-character scanner that skips comments and strings,
 * working across all CSS-like syntaxes (CSS, SCSS, Less, Sass, Stylus).
 */
export const findClassPositions = (
	css: string,
	classNames: string[],
): Map<string, Position> => {
	const positions = new Map<string, Position>();
	const remaining = new Set(classNames);
	let line = 1;
	let column = 1;
	let i = 0;

	while (i < css.length && remaining.size > 0) {
		// Skip block comments: /* ... */
		if (css[i] === '/' && css[i + 1] === '*') {
			i += 2;
			column += 2;
			while (i < css.length && !(css[i] === '*' && css[i + 1] === '/')) {
				if (css[i] === '\n') {
					line += 1;
					column = 1;
				} else {
					column += 1;
				}
				i += 1;
			}
			i += 2;
			column += 2;
			continue;
		}

		// Skip url(...) content which may contain // (e.g. https://)
		if (
			startsWithIgnoreAsciiCase(css, i, 'url(')
		) {
			const skippedUrl = skipUrlFunction(css, i, line, column);
			i = skippedUrl.next;
			line = skippedUrl.line;
			column = skippedUrl.column;
			continue;
		}

		// Skip line comments: // ...
		if (css[i] === '/' && css[i + 1] === '/') {
			i += 2;
			while (i < css.length && css[i] !== '\n') {
				i += 1;
			}
			continue;
		}

		// Skip strings: "..." and '...'
		if (css[i] === '"' || css[i] === "'") {
			const skippedString = skipQuotedString(css, i, line, column);
			i = skippedString.next;
			line = skippedString.line;
			column = skippedString.column;
			continue;
		}

		// Skip @extend and @apply references: these use .className in
		// a non-selector context (SCSS @extend, Tailwind @apply)
		if (css[i] === '@') {
			const atRule = readCssIdentifier(css, i + 1);
			if (
				(atRule.name === 'extend' || atRule.name === 'apply')
				&& isCssWhitespace(css.codePointAt(atRule.end))
			) {
				while (i < css.length && css[i] !== '\n' && css[i] !== ';') {
					i += 1;
					column += 1;
				}
				continue;
			}
		}

		// Check for class selector: . followed by a target class name
		if (css[i] === '.') {
			const identifier = readCssIdentifier(css, i + 1);
			if (
				identifier.name
				&& remaining.has(identifier.name)
				&& css[identifier.end] !== '('
			) {
				positions.set(identifier.name, {
					line,
					column,
				});
				remaining.delete(identifier.name);
			}

			if (identifier.end > i + 1) {
				column += identifier.end - (i + 1);
				i = identifier.end - 1;
			}
		}

		if (css[i] === '\n') {
			line += 1;
			column = 1;
		} else {
			column += 1;
		}
		i += 1;
	}

	return positions;
};
