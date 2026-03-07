import { describe, test, expect } from 'manten';
import { findClassPositions } from '../../src/plugin/find-class-positions.ts';

describe('findClassPositions', () => {
	test('basic CSS selectors', () => {
		const css = `.button { color: red; }
.header { color: blue; }`;
		const result = findClassPositions(css, ['button', 'header']);
		expect(result.get('button')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('header')).toStrictEqual({
			line: 2,
			column: 1,
		});
	});

	test('compound selectors', () => {
		const css = '.button.active { color: red; }';
		const result = findClassPositions(css, ['button', 'active']);
		expect(result.get('button')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('active')).toStrictEqual({
			line: 1,
			column: 8,
		});
	});

	test('multi-selector rule', () => {
		const css = '.foo, .bar { color: red; }';
		const result = findClassPositions(css, ['foo', 'bar']);
		expect(result.get('foo')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('bar')).toStrictEqual({
			line: 1,
			column: 7,
		});
	});

	test('first occurrence wins for duplicate selectors', () => {
		const css = `.button { color: red; }
.button:hover { color: blue; }`;
		const result = findClassPositions(css, ['button']);
		expect(result.get('button')).toStrictEqual({
			line: 1,
			column: 1,
		});
	});

	test('skips block comments', () => {
		const css = `/* .button is a class */
.button { color: red; }`;
		const result = findClassPositions(css, ['button']);
		expect(result.get('button')).toStrictEqual({
			line: 2,
			column: 1,
		});
	});

	test('skips line comments', () => {
		const css = `// .button is a class
.button { color: red; }`;
		const result = findClassPositions(css, ['button']);
		expect(result.get('button')).toStrictEqual({
			line: 2,
			column: 1,
		});
	});

	test('skips double-quoted strings', () => {
		const css = `.label {
	content: ".button";
}
.button { color: red; }`;
		const result = findClassPositions(css, ['label', 'button']);
		expect(result.get('label')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('button')).toStrictEqual({
			line: 4,
			column: 1,
		});
	});

	test('skips single-quoted strings', () => {
		const css = `.label {
	content: '.button';
}
.button { color: red; }`;
		const result = findClassPositions(css, ['label', 'button']);
		expect(result.get('button')).toStrictEqual({
			line: 4,
			column: 1,
		});
	});

	test('skips strings with escaped quotes', () => {
		const css = String.raw`.label {
	content: "it\'s .button";
}
.button { color: red; }`;
		const result = findClassPositions(css, ['button']);
		expect(result.get('button')).toStrictEqual({
			line: 4,
			column: 1,
		});
	});

	test('SCSS nesting with &', () => {
		const css = `.button {
	color: red;
	&.active {
		color: blue;
	}
}`;
		const result = findClassPositions(css, ['button', 'active']);
		expect(result.get('button')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('active')).toStrictEqual({
			line: 3,
			column: 3,
		});
	});

	test('Sass indented syntax', () => {
		const sass = `.button
  color: red

  &.active
    color: blue

.sibling
  color: green`;
		const result = findClassPositions(sass, ['button', 'active', 'sibling']);
		expect(result.get('button')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('active')).toStrictEqual({
			line: 4,
			column: 4,
		});
		expect(result.get('sibling')).toStrictEqual({
			line: 7,
			column: 1,
		});
	});

	test('Stylus syntax', () => {
		const styl = `.button
  color red

  &.active
    color blue

.sibling
  color green`;
		const result = findClassPositions(styl, ['button', 'active', 'sibling']);
		expect(result.get('button')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('active')).toStrictEqual({
			line: 4,
			column: 4,
		});
		expect(result.get('sibling')).toStrictEqual({
			line: 7,
			column: 1,
		});
	});

	test('does not match class name in URL path', () => {
		const css = `.icon {
	background: url(./button.png);
}
.button { color: red; }`;
		const result = findClassPositions(css, ['button', 'icon']);
		expect(result.get('icon')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('button')).toStrictEqual({
			line: 4,
			column: 1,
		});
	});

	test('skips grid template strings', () => {
		const css = `.grid {
	grid-template: ".header .header" / 1fr;
}
.header { color: red; }`;
		const result = findClassPositions(css, ['grid', 'header']);
		expect(result.get('grid')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('header')).toStrictEqual({
			line: 4,
			column: 1,
		});
	});

	test('skips Less mixin calls', () => {
		const css = `.button {
	.mixin();
	color: red;
}
.mixin { display: none; }`;
		const result = findClassPositions(css, ['button', 'mixin']);
		expect(result.get('button')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('mixin')).toStrictEqual({
			line: 5,
			column: 1,
		});
	});

	test('handles pseudo-selectors after class', () => {
		const css = '.button:hover { color: blue; }';
		const result = findClassPositions(css, ['button']);
		expect(result.get('button')).toStrictEqual({
			line: 1,
			column: 1,
		});
	});

	test('CSS-escaped class names', () => {
		const css = String.raw`.foo\:bar { color: red; }
.normal { color: blue; }`;
		const result = findClassPositions(css, ['foo:bar', 'normal']);
		expect(result.get('foo:bar')).toStrictEqual({
			line: 1,
			column: 1,
		});
		expect(result.get('normal')).toStrictEqual({
			line: 2,
			column: 1,
		});
	});

	test('SCSS with variables and comments before selector', () => {
		const scss = `@use 'colors';
$padding: 16px;

.container {
	padding: $padding;
	// .button is used inside
	&.expanded {
		padding: $padding * 2;
	}
}

.button {
	color: red;
}`;
		const result = findClassPositions(scss, ['container', 'expanded', 'button']);
		expect(result.get('container')).toStrictEqual({
			line: 4,
			column: 1,
		});
		expect(result.get('expanded')).toStrictEqual({
			line: 7,
			column: 3,
		});
		expect(result.get('button')).toStrictEqual({
			line: 12,
			column: 1,
		});
	});

	test('returns empty map for unknown class names', () => {
		const css = '.button { color: red; }';
		const result = findClassPositions(css, ['nonexistent']);
		expect(result.size).toBe(0);
	});

	test('empty CSS returns empty map', () => {
		const result = findClassPositions('', ['button']);
		expect(result.size).toBe(0);
	});

	test('multiline block comment with class name on each line', () => {
		const css = `/*
.button
.header
*/
.button { color: red; }
.header { color: blue; }`;
		const result = findClassPositions(css, ['button', 'header']);
		expect(result.get('button')).toStrictEqual({
			line: 5,
			column: 1,
		});
		expect(result.get('header')).toStrictEqual({
			line: 6,
			column: 1,
		});
	});
});
