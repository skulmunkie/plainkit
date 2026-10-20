// Inline plainkit-audit-ignore comments (#1518, design 5.3 A-6b).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { run } from './cli.mjs';
import { scanIgnores, applyIgnores } from './ignore.mjs';
import { makeTempDir } from '../tempdir.mjs';

function capture() {
    const out = [];
    const err = [];
    return { out, err, stdout: (...a) => out.push(a.join(' ')), stderr: (...a) => err.push(a.join(' ')) };
}

test('scanIgnores: html, line and block comments; a missing rule id or reason is a problem, not an ignore', () => {
    const text = [
        '<!-- plainkit-audit-ignore D1, T2 -- legacy markup -->',
        '// plainkit-audit-ignore P1 -- measured on purpose',
        '/* plainkit-audit-ignore A1 */',
        '<!-- plainkit-audit-ignore -- no rule -->',
    ].join('\n');
    const { ignores, problems } = scanIgnores([{ path: 'a.html', text }]);
    assert.deepEqual(ignores.map(g => [g.line, g.rules, g.reason]), [[1, ['D1', 'T2'], 'legacy markup'], [2, ['P1'], 'measured on purpose']]);
    assert.deepEqual(problems.map(p => [p.line, p.message]), [[3, 'has no reason'], [4, 'names no rule id']]);
});

test('applyIgnores: the comment line and the next line only; other rules and other lines stay', () => {
    const ignores = [{ file: 'a.html', line: 1, rules: ['D1'], reason: 'r' }, { file: 'a.html', line: 9, rules: ['D1'], reason: 'unused' }];
    const f = (rule, line) => ({ file: 'a.html', rule, line });
    const { kept, suppressed, unused } = applyIgnores([f('D1', 2), f('D1', 3), f('T1', 2)], ignores);
    assert.equal(suppressed.length, 1);
    assert.deepEqual(kept.map(x => [x.rule, x.line]), [['D1', 3], ['T1', 2]]);
    assert.equal(unused.length, 1);
});

test('CLI: an inline ignore suppresses, is counted and listed; a bare one fails the run', async () => {
    const dir = makeTempDir('plainkit-audit-');
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, '<!-- plainkit-audit-ignore D1 -- legacy markup until pk-button lands -->\n<button>Go</button>\n<button>Stay</button>\n');
    const c = capture();
    await run(['--format', 'json'], { cwd: dir, ...c });
    const out = JSON.parse(c.out.join('\n'));
    assert.deepEqual(out.findings.filter(f => f.id === 'D1').map(f => f.line), [3]);
    assert.equal(out.summary.suppressed, 1);

    const l = capture();
    assert.equal(await run(['--list-suppressions'], { cwd: dir, ...l }), 0);
    assert.match(l.out.join('\n'), /index\.html:1 {2}D1 {2}legacy markup/);

    fs.writeFileSync(file, '<!-- plainkit-audit-ignore D1 -->\n<button>Go</button>\n');
    const b = capture();
    assert.equal(await run([], { cwd: dir, ...b }), 1);
    assert.match(b.err.join('\n'), /has no reason/);
});

test('CLI: an unused ignore warns (exit 0), fails under --strict, and is marked in --list-suppressions', async () => {
    const dir = makeTempDir('plainkit-audit-');
    fs.writeFileSync(path.join(dir, 'index.html'), '<!-- plainkit-audit-ignore D1 -- no longer needed -->\n<p>Fine</p>\n');
    const w = capture();
    assert.equal(await run([], { cwd: dir, ...w }), 0);
    assert.match(w.err.join('\n'), /index\.html:1: plainkit-audit-ignore D1 suppresses nothing[\s\S]*FIX: delete/);
    assert.equal(await run(['--strict'], { cwd: dir, ...capture() }), 1);
    const l = capture();
    await run(['--list-suppressions'], { cwd: dir, ...l });
    assert.match(l.out.join('\n'), /D1 {2}no longer needed {2}\(unused\)/);
});

test('CRLF and LF files behave the same: scanIgnores finds the marker, and the CLI suppresses and lists it (#1655)', async () => {
    const lines = ['<!-- plainkit-audit-ignore D1 -- legacy markup until pk-button lands -->', '<button>Go</button>', '<button>Stay</button>', ''];
    const scanned = eol => scanIgnores([{ path: 'a.html', text: lines.join(eol) }]);
    assert.deepEqual(scanned('\r\n'), scanned('\n'));
    assert.deepEqual(scanned('\r\n').ignores.map(g => [g.line, g.rules, g.reason]), [[1, ['D1'], 'legacy markup until pk-button lands']]);

    const results = [];
    for (const eol of ['\n', '\r\n']) {
        const dir = makeTempDir('plainkit-audit-');
        fs.writeFileSync(path.join(dir, 'index.html'), lines.join(eol));
        const c = capture();
        await run(['--format', 'json'], { cwd: dir, ...c });
        const out = JSON.parse(c.out.join('\n'));
        const l = capture();
        await run(['--list-suppressions'], { cwd: dir, ...l });
        results.push([out.findings.filter(f => f.id === 'D1').map(f => f.line), out.summary.suppressed, l.out.join('\n')]);
    }
    assert.deepEqual(results[1], results[0]);
    assert.equal(results[1][1], 1);
    assert.match(results[1][2], /index\.html:1 {2}D1 {2}legacy markup/);
});

test('block ignores: start/end bracket a range; unknown rule, unended and stray markers are problems (#1518)', () => {
    const known = new Set(['D1', 'T2']);
    for (const eol of ['\n', '\r\n']) {
        const text = ['<!-- plainkit-audit-ignore-start D1 -- legacy block -->', '<b>x</b>', '<b>y</b>', '<!-- plainkit-audit-ignore-end -->', '<b>z</b>'].join(eol);
        const { ignores, problems } = scanIgnores([{ path: 'a.html', text }], known);
        assert.deepEqual(problems, []);
        const f = line => ({ file: 'a.html', rule: 'D1', line });
        const r = applyIgnores([f(2), f(3), f(5)], ignores);
        assert.deepEqual(r.kept.map(x => x.line), [5]);
        assert.equal(r.suppressed[0].reason, 'legacy block');
    }
    const bad = text => scanIgnores([{ path: 'a.html', text }], known).problems.map(p => p.message);
    assert.deepEqual(bad('<!-- plainkit-audit-ignore Z9 -- why -->'), ['names unknown rule Z9']);
    assert.deepEqual(bad('// plainkit-audit-ignore-start D1 -- why'), ['starts a block that is never ended']);
    assert.deepEqual(bad('// plainkit-audit-ignore-end'), ['ends a block that was never started']);
    assert.deepEqual(bad('@* plainkit-audit-ignore-start D1 *@'), ['has no reason']);
});

test('CLI: an unknown rule id fails the run; a block ignore is reported as ignored with reason', async () => {
    const dir = makeTempDir('plainkit-audit-');
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, '<!-- plainkit-audit-ignore Z9 -- typo -->\n<button>Go</button>\n');
    const u = capture();
    assert.equal(await run([], { cwd: dir, ...u }), 1);
    assert.match(u.err.join('\n'), /names unknown rule Z9/);

    fs.writeFileSync(file, '<!-- plainkit-audit-ignore-start D1 -- legacy block -->\n<button>Go</button>\n<button>Stay</button>\n<!-- plainkit-audit-ignore-end -->\n');
    const c = capture();
    await run(['--no-color'], { cwd: dir, ...c });
    const text = c.out.join('\n');
    assert.match(text, /index\.html:2 {2}ignored with reason {2}\[D1\] {2}legacy block/);
    assert.match(text, /2 suppressed inline/);
});
