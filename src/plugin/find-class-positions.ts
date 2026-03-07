type Position = {
	line: number;
	column: number;
};

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
	)
);

/*
 * Escape non-identifier characters in a class name for matching against
 * CSS source where special characters are backslash-escaped.
 * e.g. "foo:bar" → "foo\\:bar"
 */
const cssEscapeClassName = (name: string) => {
	let escaped = '';
	for (let i = 0; i < name.length; i += 1) {
		const code = name.codePointAt(i);
		escaped += isIdentifierChar(code) ? name[i] : `\\${name[i]}`;
	}
	return escaped;
};

type SearchTarget = {
	className: string;
	pattern: string;
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

	// Build search targets: for each class name, prepare both the literal
	// and CSS-escaped form (e.g. "foo:bar" → also search for "foo\:bar")
	const targets: SearchTarget[] = [];
	for (const className of classNames) {
		const escaped = cssEscapeClassName(className);
		targets.push({
			className,
			pattern: className,
		});
		if (escaped !== className) {
			targets.push({
				className,
				pattern: escaped,
			});
		}
	}

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
			const quote = css[i];
			i += 1;
			column += 1;
			while (i < css.length && css[i] !== quote) {
				if (css[i] === '\\') {
					i += 1;
					column += 1;
				}
				if (css[i] === '\n') {
					line += 1;
					column = 1;
				} else {
					column += 1;
				}
				i += 1;
			}
			i += 1;
			column += 1;
			continue;
		}

		// Check for class selector: . followed by a target class name
		if (css[i] === '.') {
			for (const target of targets) {
				if (!remaining.has(target.className)) {
					continue;
				}

				const end = i + 1 + target.pattern.length;
				if (
					css.slice(i + 1, end) === target.pattern
					&& (
						end >= css.length
						|| (
							!isIdentifierChar(css.codePointAt(end))
							// Skip Less mixin calls: .name()
							&& css[end] !== '('
						)
					)
				) {
					positions.set(target.className, {
						line,
						column,
					});
					remaining.delete(target.className);
					break;
				}
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
