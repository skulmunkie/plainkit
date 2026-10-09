// scripts/verify.mjs: the pure parts (argument parsing, which checks run, the FIX table and its copy in AGENTS.md, the failure excerpt) and the runner
// with fake checks. Run: node --test scripts/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS, GROUPS, parseArgs, selectChecks, fixTable, withFixTable, TABLE_START, TABLE_END, usefulLines, failedTests, failureSummary, formatResult, failuresOf, resolveBase, runChecks } from '../verify.mjs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ids = list => list.map(c => c.id);
const sel = (...argv) => { const { opts, errors } = parseArgs(argv); assert.deepEqual(errors, []); return ids(selectChecks(opts)); };

test('every check has an id, a group, a way to run, a cause and a one-line fix', () => {
    const seen = new Set();
    for (const c of CHECKS) {
        assert.ok(!seen.has(c.id), `duplicate id ${c.id}`); seen.add(c.id);
        assert.ok(c.group === 'setup' || GROUPS.includes(c.group), `${c.id}: group ${c.group}`);
        assert.ok(typeof c.cmd === 'function' || typeof c.fn === 'function', `${c.id}: no cmd or fn`);
        assert.ok(c.cause && c.fix, `${c.id}: cause and fix are required`);
        assert.ok(!/\n/.test(c.fix) && !/\n/.test(c.cause), `${c.id}: one line each`);
        for (const n of c.needs) assert.ok(CHECKS.some(x => x.id === n), `${c.id} needs unknown ${n}`);
    }
    for (const g of GROUPS) assert.ok(CHECKS.some(c => c.group === g), `group ${g} has no check`);
});

test('argument parsing: flags, values and mistakes', () => {
    const { opts, errors } = parseArgs(['--fast', '--no-dotnet', '--browser', '--pack', '--scorecard', '--only', 'node,lint', '--base', 'origin/dev', '--verbose']);
    assert.deepEqual(errors.filter(e => !/either --fast or --only/.test(e)), []);
    assert.deepEqual([opts.fast, opts.noDotnet, opts.browser, opts.pack, opts.scorecard, opts.verbose, opts.base], [true, true, true, true, true, true, 'origin/dev']);
    assert.deepEqual(opts.only, ['node', 'lint']);
    assert.match(parseArgs(['--nope']).errors[0], /unknown argument --nope/);
    assert.match(parseArgs(['--only']).errors[0], /needs a value/);
    assert.match(parseArgs(['--only', 'bogus']).errors[0], /not a group or check/);
    assert.match(parseArgs(['--only', 'node', '--fast']).errors.join(), /either --fast or --only/);
    assert.match(parseArgs(['--budget', 'bogus']).errors[0], /not a group/);
    assert.deepEqual(parseArgs(['--only', 'node-tests', '--only', 'dotnet']).opts.only, ['node-tests', 'dotnet']);
});

test('which checks run: default, --fast, --no-dotnet, --browser, --pack, --only', () => {
    const all = sel();
    for (const id of ['bootstrap', 'changelog', 'generated-tree', 'node-tests', 'dotnet']) assert.ok(all.includes(id), id);
    assert.ok(!all.includes('browser') && !all.includes('pack') && !all.includes('scorecard'), 'browser, pack and scorecard are opt-in');
    assert.deepEqual(sel('--fast').sort(), ['audit', 'audit-modules', 'bootstrap', 'changelog', 'changelog-pr', 'node-tests', 'release-fragments']);
    assert.ok(!sel('--no-dotnet').includes('dotnet'));
    assert.ok(sel('--browser').includes('browser') && sel('--pack').includes('pack') && sel('--scorecard').includes('scorecard'));
    assert.deepEqual(sel('--only', 'lint'), ['changelog', 'changelog-pr', 'release-fragments'], 'the lint job needs no bootstrap');
    assert.deepEqual(sel('--only', 'dotnet'), ['bootstrap', 'dotnet'], 'a group pulls in what it needs');
    assert.deepEqual(sel('--only', 'node-tests'), ['bootstrap', 'node-tests']);
    assert.deepEqual(sel('--only', 'node'), ['bootstrap', 'version', 'release-pr', 'generated-tree', 'node-tests', 'audit', 'audit-modules']);
});

test('the checks are ordered cheap first', () => {
    const order = ids(CHECKS);
    assert.ok(order.indexOf('changelog') < order.indexOf('node-tests'));
    assert.ok(order.indexOf('node-tests') < order.indexOf('dotnet'));
});

test('the "When CI fails" table in AGENTS.md is exactly the table of scripts/verify.mjs', () => {
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8').replace(/\r\n/g, '\n');
    assert.ok(agents.includes('## When CI fails'), 'AGENTS.md has a "When CI fails" section');
    const next = withFixTable(agents);
    assert.notEqual(next, null, `AGENTS.md needs ${TABLE_START} ... ${TABLE_END}`);
    assert.equal(agents, next, 'AGENTS.md "When CI fails" table is out of date: run node scripts/verify.mjs --update-docs');
    for (const c of CHECKS) assert.ok(fixTable().includes(`\`${c.id}\``), `${c.id} is in the table`);
});

test('the FIX line a check prints is its table entry', () => {
    const c = CHECKS.find(x => x.id === 'node-tests');
    const out = formatResult(c, { status: 'FAIL', ms: 1234, out: 'x\n✖ failing tests:\n\ntest at a.test.mjs:1\n✖ bad (1ms)\n  AssertionError: nope\n' });
    assert.match(out, /^FAIL {2}node-tests +1\.2 s/);
    assert.ok(out.includes(`FIX: ${c.fix}`));
    assert.ok(out.includes('failing tests:') && out.includes('AssertionError'));
    assert.match(formatResult(c, { status: 'ok', ms: 500, out: '' }), /^ok {4}node-tests +0\.5 s$/);
    assert.match(formatResult(c, { status: 'skip', reason: 'no base branch', out: '' }), /^skip +node-tests +no base branch$/);
    const f = failuresOf([{ status: 'FAIL', check: c, out: 'error: boom' }, { status: 'ok', check: CHECKS[0], out: '' }]);
    assert.deepEqual(f.map(x => x.id), ['node-tests']);
    assert.equal(f[0].fix, c.fix);
});

test('the excerpt starts at the failing tests, else at the first error, and drops runtime stack noise', () => {
    assert.equal(usefulLines('a\nb\n✖ failing tests:\n\nthe real one\n    at node:internal/x:1\n    at file:///mine.mjs:2'), '✖ failing tests:\nthe real one\n    at file:///mine.mjs:2');
    assert.equal(usefulLines('one\ntwo\nfoo.cs(3,4): error CS1002: ; expected\nafter').split('\n')[0], 'two');
    assert.equal(usefulLines('[31mError: red[0m'), 'Error: red');
    assert.equal(usefulLines('first\nsecond'), 'first\nsecond');
    assert.ok(usefulLines('x'.repeat(5000), { maxChars: 100 }).length <= 110);
    assert.ok(usefulLines(Array.from({ length: 100 }, (_, i) => `l${i}`).join('\n')).split('\n').length <= 14);
});

test('the base branch: --base wins, the pull request base in CI, nothing in CI without one', () => {
    assert.equal(resolveBase({ opts: { base: 'origin/x' }, env: {} }), 'origin/x');
    assert.equal(resolveBase({ opts: {}, env: { GITHUB_BASE_REF: 'main' } }), 'origin/main');
    assert.equal(resolveBase({ opts: {}, env: { GITHUB_ACTIONS: 'true' } }), null);
});

test('the runner: independent checks run in parallel, a failed dependency skips what needs it', async () => {
    const log = [];
    const fake = (id, needs, ms, ok) => ({ id, name: id, group: 'x', needs, fast: false, fix: 'f', cause: 'c', fn: async () => { log.push(`start ${id}`); await new Promise(r => setTimeout(r, ms)); return { ok, output: '' }; } });
    const a = fake('a', [], 150, true), b = fake('b', [], 150, true), c = fake('c', ['a'], 0, true), d = fake('d', ['bad'], 0, true), bad = fake('bad', [], 0, false);
    const t = performance.now();
    const results = await runChecks([a, b, c, d, bad], {});
    assert.ok(performance.now() - t < 290, 'a and b overlapped');
    assert.deepEqual(results.map(r => r.status), ['ok', 'ok', 'ok', 'skip', 'FAIL']);
    assert.ok(log.indexOf('start a') < log.indexOf('start c'));
    assert.ok(!log.includes('start d'));
});

test('a check that runs "after" another waits for it even when it failed, but only when it is selected', async () => {
    const log = [];
    const fake = (id, extra, ok, ms) => ({ id, name: id, group: 'x', needs: [], fast: false, fix: 'f', cause: 'c', ...extra, fn: async () => { log.push(`start ${id}`); await new Promise(r => setTimeout(r, ms)); log.push(`end ${id}`); return { ok, output: '' }; } });
    const first = fake('first', {}, false, 40), second = fake('second', { after: ['first'] }, true, 0);
    const results = await runChecks([first, second], {});
    assert.deepEqual(log, ['start first', 'end first', 'start second', 'end second']);
    assert.deepEqual(results.map(r => r.status), ['FAIL', 'ok']);
    assert.deepEqual((await runChecks([second], {})).map(r => r.status), ['ok'], 'not selected: no wait');
    assert.deepEqual(CHECKS.find(c => c.id === 'pack').after, ['dotnet']);
});

// #780: a failing test is never hidden. A fixture of real runner output: several failures in several files, stderr noise from passing tests, and a missing esbuild.
function runFixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-verify-fixture-'));
    fs.writeFileSync(path.join(dir, 'a.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('passes but is noisy', () => { console.error('[pk:app] page threw Error: boom'); });\ntest('first real failure', () => assert.equal(1, 2));\ntest('second real failure', () => { throw new Error('nope'); });\n");
    fs.writeFileSync(path.join(dir, 'b.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('a failure in another file', () => assert.ok(false, 'esbuild cannot be resolved'));\ntest('fine', () => {});\n");
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', path.join(dir, 'a.test.mjs'), path.join(dir, 'b.test.mjs')], { encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) });
    return { dir, out: r.stdout + r.stderr, status: r.status };
}

test('failedTests lists every failing test by file and name, from a real runner output with noise', () => {
    const { out, status } = runFixture();
    assert.equal(status, 1);
    const names = failedTests(out).map(t => `${path.basename(t.file)}: ${t.name}`);
    assert.deepEqual(names.sort(), ['a.test.mjs: first real failure', 'a.test.mjs: second real failure', 'b.test.mjs: a failure in another file']);
    assert.ok(out.includes('[pk:app] page threw Error: boom'), 'the fixture really printed the noise');
});

test('failureSummary shows all failing tests, no noise from passing ones, and one esbuild hint line; formatResult prints it and the FIX line', () => {
    const { out } = runFixture();
    const s = failureSummary(out);
    assert.match(s, /^3 failing tests in 2 files/);
    for (const n of ['first real failure', 'second real failure', 'a failure in another file']) assert.ok(s.includes(n), n);
    assert.ok(!s.includes('page threw Error: boom') && !s.includes('passes but is noisy'), 'noise and passing tests are not in the summary');
    assert.ok(s.includes('run `npm ci`'), 'the esbuild hint');
    const text = formatResult(CHECKS.find(c => c.id === 'node-tests'), { status: 'FAIL', ms: 1000, out });
    assert.ok(text.includes('3 failing tests') && text.includes('FIX: '));
    const f = failuresOf([{ status: 'FAIL', check: CHECKS.find(c => c.id === 'node-tests'), out }])[0];
    assert.ok(f.excerpt.includes('second real failure') && f.excerpt.includes('b.test.mjs'), 'the sticky comment excerpt carries the same list');
});

test('failedTests also reads TAP output (Node 22 default reporter), leaf failures only, no noise', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-verify-tap-'));
    fs.writeFileSync(path.join(dir, 'a.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('noisy pass', () => { console.error('[pk:app] threw Error: boom'); });\ntest('suite', async t => { await t.test('inner fail', () => assert.equal(1, 2)); });\ntest('top fail', () => { throw new Error('x'); });\n");
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(dir, 'a.test.mjs')], { encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) });
    const got = failedTests(r.stdout + r.stderr).map(t => `${path.basename(t.file)}: ${t.name}`).sort();
    assert.deepEqual(got, ['a.test.mjs: inner fail', 'a.test.mjs: top fail']);
});

test('failureSummary does not cut a long list of failures (60 failing tests, all named) and falls back to the excerpt without a failing-tests block', () => {
    const many = ['✖ failing tests:', ...Array.from({ length: 60 }, (_, i) => `\ntest at core\\tests\\f${i % 7}.test.mjs:1:1\n✖ case number ${i} (1.5ms)\n  AssertionError: x`)].join('\n');
    assert.equal(failedTests(many).length, 60);
    const s = failureSummary(many, { maxLines: 60, maxChars: 99999 });
    assert.ok(s.includes('case number 59') && s.includes('60 failing tests in 7 files'));
    assert.equal(failureSummary('error: boom'), usefulLines('error: boom'));
    assert.deepEqual(failedTests('all fine'), []);
});
