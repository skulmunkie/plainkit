// Tests for the `plainkit audit` CLI (design section 5, #629 A-5): argument parsing, exit codes and the two
// fixture apps under core/tests/audit-fixtures/. The CLI is invoked in-process via `run()` with captured
// stdout/stderr, not spawned, so this stays fast and portable.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, parseArgs } from './cli.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURES = path.join(root, 'core', 'tests', 'audit-fixtures');

function capture() {
    const out = [];
    const err = [];
    return { out, err, stdout: (...a) => out.push(a.join(' ')), stderr: (...a) => err.push(a.join(' ')) };
}

test('parseArgs: flags and positionals', () => {
    const { opts, errors } = parseArgs(['src', '--strict', '--format', 'json', '--max-warnings', '5', '--rule', 'D1,T2']);
    assert.equal(errors.length, 0);
    assert.deepEqual(opts.paths, ['src']);
    assert.equal(opts.strict, true);
    assert.equal(opts.format, 'json');
    assert.equal(opts.maxWarnings, 5);
    assert.deepEqual(opts.rule, ['D1', 'T2']);
});

test('parseArgs: unknown flag is a usage error', () => {
    const { errors } = parseArgs(['--nope']);
    assert.equal(errors.length, 1);
});

test('parseArgs: --baseline is refused, not silently ignored', () => {
    const { errors } = parseArgs(['--baseline', 'x.json']);
    assert.match(errors[0], /not yet supported/);
});

test('parseArgs: --format sarif is refused, not silently ignored', () => {
    const { errors } = parseArgs(['--format', 'sarif']);
    assert.match(errors[0], /not yet supported/);
});

test('--list-rules exits 0 and prints a table', async () => {
    const c = capture();
    const code = await run(['--list-rules'], c);
    assert.equal(code, 0);
    assert.match(c.out.join('\n'), /^id\s+category/);
});

test('--explain D1 exits 0', async () => {
    const c = capture();
    const code = await run(['--explain', 'D1'], c);
    assert.equal(code, 0);
    assert.match(c.out.join('\n'), /^D1 \(D\)/);
});

test('--explain unknown id exits 2', async () => {
    const c = capture();
    const code = await run(['--explain', 'NOPE'], c);
    assert.equal(code, 2);
});

test('plain-html fixture: warnings only in normal mode, exit 0', async () => {
    const c = capture();
    const code = await run(['--format', 'json', '--no-color', path.join(FIXTURES, 'plain-html')], c);
    assert.equal(code, 0);
    const json = JSON.parse(c.out.join(''));
    const ids = json.findings.map(f => f.id);
    assert.ok(ids.includes('D1'), 'expected D1 (table) in findings');
    assert.ok(ids.includes('D2'), 'expected D2 (class hint) in findings');
    assert.ok(ids.includes('D6'), 'expected D6 (manual role) in findings');
    assert.ok(json.findings.every(f => f.severity !== 'error'));
});

test('plain-html fixture in --strict mode: same findings promoted to errors, exit 1', async () => {
    const c = capture();
    const code = await run(['--strict', '--format', 'json', '--no-color', path.join(FIXTURES, 'plain-html')], c);
    assert.equal(code, 1);
    const json = JSON.parse(c.out.join(''));
    assert.ok(json.findings.some(f => f.id === 'D1' && f.severity === 'error'));
});

test('strict-clean fixture: no errors even in --strict', async () => {
    const c = capture();
    const code = await run(['--strict', '--format', 'json', '--no-color', path.join(FIXTURES, 'strict-clean')], c);
    assert.equal(code, 0);
    const json = JSON.parse(c.out.join(''));
    assert.ok(json.findings.every(f => f.severity !== 'error'));
});

test('--max-warnings caps warnings and fails the run over budget', async () => {
    const c = capture();
    const code = await run(['--max-warnings', '0', path.join(FIXTURES, 'plain-html')], c);
    assert.equal(code, 1);
});

test('--rule filters to the requested rule only', async () => {
    const c = capture();
    const code = await run(['--rule', 'D6', '--format', 'json', '--no-color', path.join(FIXTURES, 'plain-html')], c);
    assert.equal(code, 0);
    const json = JSON.parse(c.out.join(''));
    assert.ok(json.findings.every(f => f.id === 'D6'));
    assert.ok(json.findings.length > 0);
});

test('unsupported config file path is a usage error (exit 2)', async () => {
    const c = capture();
    const code = await run(['--config', path.join(FIXTURES, 'does-not-exist.json')], c);
    assert.equal(code, 2);
});
