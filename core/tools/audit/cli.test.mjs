// Tests for the `plainkit audit` CLI (design section 5, #629 A-5): argument parsing, exit codes and the two
// fixture apps under core/tests/audit-fixtures/. The CLI is invoked in-process via `run()` with captured
// stdout/stderr, not spawned, so this stays fast and portable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, parseArgs } from './cli.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURES = path.join(root, 'core', 'tests', 'audit-fixtures');

// A scratch copy of a fixture directory, with its own cwd (config.mjs's `findConfig` walks up from `cwd`, and
// a finding's `file` is relative to it), so a baseline/allow-list test can add its own config or baseline file
// and see plain fixture-relative paths (`index.html`) without ever writing into the real fixtures directory.
function scratchFixture(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plainkit-audit-'));
    for (const file of fs.readdirSync(path.join(FIXTURES, name))) {
        fs.copyFileSync(path.join(FIXTURES, name, file), path.join(dir, file));
    }
    return dir;
}

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

test('parseArgs: --baseline takes a file (A-6)', () => {
    const { opts, errors } = parseArgs(['--baseline', 'x.json']);
    assert.equal(errors.length, 0);
    assert.equal(opts.baseline, 'x.json');
});

test('parseArgs: --format sarif is accepted (A-6)', () => {
    const { opts, errors } = parseArgs(['--format', 'sarif']);
    assert.equal(errors.length, 0);
    assert.equal(opts.format, 'sarif');
});

test('parseArgs: --update-baseline and --strict-baseline are mutually exclusive', () => {
    const { errors } = parseArgs(['--update-baseline', '--strict-baseline']);
    assert.equal(errors.length, 1);
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

test('--format sarif prints a SARIF 2.1.0 document with the finding as a result', async () => {
    const c = capture();
    const code = await run(['--strict', '--format', 'sarif', '--no-color', path.join(FIXTURES, 'plain-html')], c);
    assert.equal(code, 1);
    const sarif = JSON.parse(c.out.join(''));
    assert.equal(sarif.version, '2.1.0');
    assert.ok(sarif.runs[0].results.some(r => r.ruleId === 'D1'));
    assert.ok(sarif.runs[0].tool.driver.rules.some(r => r.id === 'D1'));
});

test('--update-baseline writes a baseline file that then suppresses the same findings', async () => {
    const cwd = scratchFixture('plain-html');
    const baselineFile = path.join(cwd, 'plainkit.audit.baseline.json');
    const updated = await run(['--update-baseline', '--quiet'], { cwd, ...capture() });
    assert.equal(updated, 0);
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    assert.ok(baseline.entries.length > 0);
    assert.ok(baseline.entries.some(e => e.rule === 'D1'));

    const c = capture();
    const code = await run(['--baseline', baselineFile, '--format', 'json', '--no-color'], { cwd, ...c });
    assert.equal(code, 0, c.out.join('\n'));
    const json = JSON.parse(c.out.join(''));
    assert.equal(json.findings.length, 0);
});

test('a baseline entry that no longer occurs is reported as fixed, and fails only with --strict-baseline', async () => {
    const cwd = scratchFixture('strict-clean');
    const baselineFile = path.join(cwd, 'plainkit.audit.baseline.json');
    fs.writeFileSync(baselineFile, JSON.stringify({ version: 1, entries: [{ rule: 'D1', file: 'index.html', fingerprint: 'deadbeefdeadbeef' }] }));

    const c1 = capture();
    const code1 = await run(['--baseline', baselineFile, '--format', 'json', '--no-color'], { cwd, ...c1 });
    assert.equal(code1, 0);
    assert.match(c1.out.join('\n'), /baseline entry fixed/);

    const c2 = capture();
    const code2 = await run(['--strict-baseline', '--baseline', baselineFile], { cwd, ...c2 });
    assert.equal(code2, 1);
});

test('a stale allow-list entry (wrong count) fails the run and names the fix', async () => {
    const cwd = scratchFixture('plain-html');
    fs.writeFileSync(path.join(cwd, 'plainkit.audit.json'), JSON.stringify({
        allow: [{ rule: 'D1', path: 'index.html', count: 5, reason: 'placeholder while the app is migrated', issue: 'https://example.test/1' }],
    }));
    const c = capture();
    const code = await run([], { cwd, ...c });
    assert.equal(code, 1);
    assert.match(c.err.join('\n'), /declares count 5, but 1 real hit/);
});

test('a dead allow-list entry (no matching finding) fails the run', async () => {
    const cwd = scratchFixture('plain-html');
    fs.writeFileSync(path.join(cwd, 'plainkit.audit.json'), JSON.stringify({
        allow: [{ rule: 'T1', path: 'index.html', count: 1, reason: 'placeholder while the app is migrated', issue: 'https://example.test/1' }],
    }));
    const c = capture();
    const code = await run([], { cwd, ...c });
    assert.equal(code, 1);
    assert.match(c.err.join('\n'), /no matching finding/);
});
