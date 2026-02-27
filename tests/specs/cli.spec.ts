import path from 'node:path';
import { createFixture } from 'fs-fixture';
import { describe, test, expect } from 'manten';
import { execa } from 'execa';

const cliPath = path.resolve('dist/cli/index.mjs');
const runCli = (
	args: string[],
	cwd: string,
) => execa('node', [cliPath, ...args], {
	cwd,
	reject: false,
});

describe('CLI', () => {
	test('no arguments shows error', async () => {
		await using fixture = await createFixture({});
		const result = await runCli([], fixture.path);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toMatch('Missing required parameter "globs"');
	});

	test('generates .d.ts for single CSS module', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['style.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const button: string');
		expect(dts).toMatch('export {');
		expect(dts).toMatch('export default');
	});

	test('generates .d.ts for glob pattern', async () => {
		await using fixture = await createFixture({
			'src/a.module.css': '.alpha { color: red; }',
			'src/nested/b.module.css': '.beta { color: blue; }',
		});

		const result = await runCli(['**/*.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);

		const dtsA = await fixture.readFile('src/a.module.css.d.ts', 'utf8');
		expect(dtsA).toMatch('declare const alpha: string');

		const dtsB = await fixture.readFile('src/nested/b.module.css.d.ts', 'utf8');
		expect(dtsB).toMatch('declare const beta: string');
	});

	test('no files matched shows warning on stderr', async () => {
		await using fixture = await createFixture({});
		const result = await runCli(['**/*.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);
		expect(result.stderr).toMatch('No files matched');
	});

	test('CSS parse error sets exit code 1', async () => {
		await using fixture = await createFixture({
			'broken.module.css': '.button { color: ',
		});

		const result = await runCli(['broken.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('broken.module.css');
		expect(result.stderr).toMatch('Unclosed block');
	});

	test('--export-mode named', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['--export-mode', 'named', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('export {');
		expect(dts).not.toMatch('export default');
	});

	test('--export-mode default', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['--export-mode', 'default', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).not.toMatch('export {');
		expect(dts).toMatch('export default');
	});

	test('--locals-convention camelCase', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.my-button { color: red; }',
		});

		const result = await runCli(['--locals-convention', 'camelCase', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('myButton');
		expect(dts).toMatch('"my-button"');
	});

	test('--locals-convention camelCaseOnly', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.my-button { color: red; }',
		});

		const result = await runCli(['--locals-convention', 'camelCaseOnly', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('myButton');
		expect(dts).not.toMatch('my-button');
	});

	test('--locals-convention dashes', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.my-button { color: red; }',
		});

		const result = await runCli(['--locals-convention', 'dashes', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('myButton');
		expect(dts).toMatch('"my-button"');
	});

	test('--locals-convention dashesOnly', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.my-button { color: red; }',
		});

		const result = await runCli(['--locals-convention', 'dashesOnly', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('myButton');
		expect(dts).not.toMatch('my-button');
	});

	test('--arbitrary-exports', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.my-button { color: red; }',
		});

		const result = await runCli(['--arbitrary-exports', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('"my-button"');
	});

	test('invalid --export-mode shows error', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['--export-mode', 'invalid', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('Invalid export mode');
	});

	test('invalid --locals-convention shows error', async () => {
		await using fixture = await createFixture({
			'style.module.css': '.button { color: red; }',
		});

		const result = await runCli(['--locals-convention', 'invalid', 'style.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('Invalid locals convention');
	});

	test('multiple files with one parse error continues others', async () => {
		await using fixture = await createFixture({
			'good.module.css': '.button { color: red; }',
			'broken.module.css': '.button { color: ',
		});

		const result = await runCli(['good.module.css', 'broken.module.css'], fixture.path);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toMatch('broken.module.css');
		expect(result.stderr).toMatch('Unclosed block');

		const dts = await fixture.readFile('good.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const button: string');
	});

	test('composes from local classes', async () => {
		await using fixture = await createFixture({
			'style.module.css': `.base { color: red; }
.button { composes: base; background: blue; }`,
		});

		const result = await runCli(['style.module.css'], fixture.path);
		expect(result.exitCode).toBe(0);

		const dts = await fixture.readFile('style.module.css.d.ts', 'utf8');
		expect(dts).toMatch('declare const base: string');
		expect(dts).toMatch('declare const button: string');
	});
});
