// scripts/size-trend.mjs: the report's shape and the +15 percent acknowledgement rule (pure parts; no build). #1985 step 6.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_VERSION, compare, flatten, makeEntry, table, validate } from '../size-trend.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const entry = (version, metrics, extra = {}) => ({ version, date: '2026-11-23', tree: 'x', exceptions: 0, metrics, ...extra });
const hist = (...entries) => ({ entries: [entry(BASELINE_VERSION, { 'app.entryGz': 1000, 'page.table.gzip': 2000, 'page.table.requests': 12 }), ...entries] });

test('flatten names every metric the spec lists and skips what was not measured', () => {
    const m = flatten({
        pageWeight: { table: { requests: 12, gzip: 2, brotli: 1 } }, appEntryGzBytes: 5, core: { packed: 3, unpacked: 4 },
        packages: { 'plainkit.tools': { zip: 6, unpacked: 7 } }, blazorPayload: null, elements: { totalGz: 9, count: 2, above3_5: 1, above4: 0 },
    });
    assert.deepEqual(Object.keys(m), ['page.table.requests', 'page.table.gzip', 'page.table.brotli', 'app.entryGz', 'core.packed', 'core.unpacked', 'pkg.plainkit.tools.zip', 'pkg.plainkit.tools.unpacked', 'elements.totalGz', 'elements.count', 'elements.above3_5kb', 'elements.above4kb']);
    assert.equal(flatten({ blazorPayload: { coreOnly: 1, full: 2 } })['blazor.full'], 2);
});

test('makeEntry carries version, date, tree, exceptions, metrics and the top elements', () => {
    const e = makeEntry({ version: '1.0.0', date: 'd', measured: { tree: 't', pageWeight: {}, packages: {} }, elements: { totalGz: 1, count: 1, above3_5: 0, above4: 0, top: [['a.js', 1]] }, exceptions: 2 });
    assert.deepEqual(Object.keys(e), ['version', 'date', 'tree', 'exceptions', 'metrics', 'topElements']);
    assert.equal(e.exceptions, 2);
});

test('compare gives the delta to the previous release and to the baseline', () => {
    const h = hist(entry('0.31.0', { 'app.entryGz': 1100, 'page.table.gzip': 2000, 'page.table.requests': 12 }), entry('0.32.0', { 'app.entryGz': 1160, 'page.table.gzip': 2000, 'page.table.requests': 12 }));
    const r = Object.fromEntries(compare(h, h.entries[2]).map(x => [x.metric, x]));
    assert.equal(r['app.entryGz'].vsPrev, 5.5);
    assert.equal(r['app.entryGz'].vsBase, 16);
    assert.ok(r['app.entryGz'].warn && r['app.entryGz'].flagged && !r['app.entryGz'].acknowledged);
    assert.equal(r['page.table.gzip'].vsBase, 0);
});

test('+15 percent of the baseline needs an acknowledgement; exactly +15 does not; a size alone never fails', () => {
    assert.deepEqual(validate(hist(entry('0.31.0', { 'app.entryGz': 1150 }))), []);
    const over = validate(hist(entry('0.31.0', { 'app.entryGz': 1151 })));
    assert.equal(over.length, 1);
    assert.match(over[0], /app\.entryGz is 15\.1% over the 0\.30\.0 baseline.*FIX:/);
    const ack = { acknowledged: [{ metric: 'app.entryGz', approvedBy: 'owner', reason: 'the new shell' }] };
    assert.deepEqual(validate(hist(entry('0.31.0', { 'app.entryGz': 3000 }, ack))), []);
});

test('a metric the baseline lacks is never flagged', () => {
    assert.deepEqual(validate(hist(entry('0.31.0', { 'pkg.plainkit.icons.zip': 99999 }))), []);
});

test('validate rejects a malformed history', () => {
    assert.match(validate({})[0], /entries/);
    assert.match(validate({ entries: [entry('1.0', { a: 1 })] })[0], /X\.Y\.Z/);
    assert.match(validate({ entries: [entry('0.31.0', { a: 1 })] }).join('\n'), /baseline entry 0\.30\.0 is missing/);
    assert.match(validate(hist(entry('0.31.0', { a: -1 }))).join('\n'), /non-negative/);
    assert.match(validate(hist(entry('0.31.0', { a: 1 }, { acknowledged: [{ metric: 'a' }] }))).join('\n'), /approvedBy/);
    assert.match(validate(hist(entry('0.31.0', { a: 1 }), entry('0.31.0', { a: 1 }))).join('\n'), /twice/);
});

test('the table has the columns and marks the flags', () => {
    const h = hist(entry('0.31.0', { 'app.entryGz': 1300 }));
    const t = table(compare(h, h.entries[1]));
    assert.match(t.split('\n')[0], /metric \| now \| previous \| vs previous \| baseline \| vs baseline/);
    assert.match(t, /app\.entryGz \| 1300 \| 1000 \| \+30% \| 1000 \| \+30% \| OVER \+15%, NEEDS ACKNOWLEDGEMENT/);
});

test('the committed history has the baseline and the current release is the latest entry or older', () => {
    const h = JSON.parse(fs.readFileSync(path.join(root, 'core', 'tests', 'size-history.json'), 'utf8'));
    assert.ok(h.entries.some(e => e.version === BASELINE_VERSION), 'FIX: core/tests/size-history.json needs the 0.30.0 baseline entry');
    for (const e of h.entries) assert.ok(Object.keys(e.metrics).length > 20, `${e.version} has too few metrics`);
});
