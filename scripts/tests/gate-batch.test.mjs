// scripts/gate-batch.mjs: the pure parts of the runner's batch gate. Nothing is merged or run here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attestPlan, caseNames, formatStep, issueFilter, parseArgs } from '../gate-batch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('parseArgs reads every option and rejects bad ones', () => {
    const o = parseArgs(['--result', 'r.json', '--branches', 'agent/1-a,agent/2-b', '--queue', 'integration/queue-9', '--jobs', '3', '--cache-dir', 'c']);
    assert.equal(o.branches.length, 2);
    assert.equal(o.queue, 'integration/queue-9');
    assert.equal(o.jobs, 3);
    assert.ok(path.isAbsolute(o.result) && path.isAbsolute(o.cacheDir));
    assert.throws(() => parseArgs([]), /--result <file\.json> is required/);
    assert.throws(() => parseArgs(['--result', 'r.json', '--jobs', '0']));
    assert.throws(() => parseArgs(['--result', 'r.json', '--jobs', 'x']));
    assert.throws(() => parseArgs(['--result', 'r.json', '--queue', 'q']), /--queue needs --branches/);
    assert.throws(() => parseArgs(['--result', 'r.json', '--nope']));
    assert.throws(() => parseArgs(['--result', 'r.json', '--branches']), /needs a value/);
});

test('issueFilter turns branch names into issue numbers', () => {
    assert.deepEqual(issueFilter(['agent/1813-list-item-spacing', 'agent/1810-z-page-css-offset', 'agent/speed-pack-parallel', 'agent/1813-other']), ['#1813', '#1810']);
});

test('caseNames finds browser case names', () => {
    const text = "const cases = [\n['button: a (#12)', async t => {\n}],\n[\"dock: b\", async () => {\n}],\n['x', 1],\n];\n";
    assert.deepEqual(caseNames(text), ['button: a (#12)', 'dock: b']);
    const dir = path.join(root, 'core', 'tests', 'browser');
    const n = fs.readdirSync(dir).filter(f => /^cases.*\.js$/.test(f)).flatMap(f => caseNames(fs.readFileSync(path.join(dir, f), 'utf8'))).length;
    assert.ok(n >= 700, `FIX: the case-name pattern changed (found ${n} names, expected 700 or more); update caseNames in scripts/gate-batch.mjs`);
});

test('attestPlan keeps the union of elements and issues, and skips an empty selection', () => {
    const names = ['button: defaults', 'table: sort (#1813)'];
    assert.deepEqual(attestPlan({ elements: ['button'], filter: [], names }), { argv: ['scripts/attest-browser.mjs', '--elements', 'button'], selected: 1 });
    assert.deepEqual(attestPlan({ elements: [], filter: ['#1813'], names }), { argv: ['scripts/attest-browser.mjs', '--filter', '#1813'], selected: 1 });
    assert.equal(attestPlan({ elements: ['nothing'], filter: ['#99'], names }), null);
    const both = attestPlan({ elements: ['button'], filter: ['#99'], names });
    assert.deepEqual(both.argv, ['scripts/attest-browser.mjs', '--elements', 'button', '--filter', '#99']);
});

test('formatStep shows name, status and seconds', () => {
    assert.match(formatStep({ name: 'verify', ok: true, seconds: 61, log: 'v.log' }), /verify\s+ok\s+61 s/);
    assert.match(formatStep({ name: 'attest', ok: false, seconds: 5, log: 'a.log' }), /attest\s+FAIL\s+5 s/);
    assert.match(formatStep({ name: 'attest', skipped: 'nothing', seconds: 0 }), /attest\s+skip\s+0 s\s+nothing/);
});
