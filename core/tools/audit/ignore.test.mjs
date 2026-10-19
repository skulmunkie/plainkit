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
