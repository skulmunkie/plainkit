// The sharded browser suite (#2027): selecting a shard, the --shard flag, and merging shard records so a sharded run means what a single run did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShard, shardOf } from '../../core/tests/browser/case-filter.js';
import { parseArgs } from '../attest-browser.mjs';
import { mergeShards } from '../browser-shard-merge.mjs';

test('shards are disjoint, together the whole list, in order', () => {
    const list = Array.from({ length: 11 }, (_, i) => i);
    const parts = [1, 2, 3, 4].map(k => shardOf(list, { k, n: 4 }));
    assert.deepEqual(parts.flat().sort((a, b) => a - b), list);
    assert.equal(new Set(parts.flat()).size, list.length);
    assert.deepEqual(parts[0], [0, 4, 8]);
    assert.equal(shardOf(list, null), list);
});

test('parseShard accepts k/n and refuses the rest', () => {
    assert.deepEqual(parseShard('2/4'), { k: 2, n: 4 });
    for (const bad of ['0/4', '5/4', 'x', '', null, '1/0']) assert.equal(parseShard(bad), null);
});

test('attest-browser --shard and --out are parsed, a bad shard is an error', () => {
    const o = parseArgs(['--shard', '3/4', '--out', 'r.json']);
    assert.deepEqual(o.shard, { k: 3, n: 4 });
    assert.equal(o.out, 'r.json');
    assert.throws(() => parseArgs(['--shard', '9/4']), /--shard needs k\/n/);
});

const rec = (k, n, total, results) => ({ shard: { k, n }, totalCases: total, results });
const ok = name => ({ name, ok: true, ms: 1 });

test('a complete green set merges into one report', () => {
    const r = mergeShards([rec(1, 2, 3, [ok('a'), ok('c')]), rec(2, 2, 3, [ok('b')])]);
    assert.equal(r.complete, true);
    assert.equal(r.ok, true);
    assert.equal(r.report.totalCases, 3);
    assert.equal(r.report.passed, 3);
    assert.equal(r.report.shard, null);
});

test('a failing case is complete but not ok, and is counted', () => {
    const r = mergeShards([rec(1, 2, 2, [ok('a')]), rec(2, 2, 2, [{ name: 'b', ok: false, error: 'boom' }])]);
    assert.equal(r.complete, true);
    assert.equal(r.ok, false);
    assert.equal(r.report.failed, 1);
});

test('a missing shard, a duplicate, short results or disagreeing totals are incomplete (never stamped green)', () => {
    assert.equal(mergeShards([rec(1, 2, 2, [ok('a')])]).complete, false);
    assert.equal(mergeShards([rec(1, 2, 2, [ok('a')]), rec(1, 2, 2, [ok('a')])]).complete, false);
    assert.equal(mergeShards([rec(1, 2, 3, [ok('a')]), rec(2, 2, 3, [ok('b')])]).complete, false);
    assert.equal(mergeShards([rec(1, 2, 2, [ok('a')]), rec(2, 2, 3, [ok('b')])]).complete, false);
    assert.equal(mergeShards([]).complete, false);
    assert.equal(mergeShards([{}]).complete, false);
});

test('blazor-browser --publish-cache: a finished publish is reused, a missing one runs and is marked', async () => {
    const fs = await import('node:fs'), path = await import('node:path');
    const { makeTempDir } = await import('../../core/tools/tempdir.mjs');
    const { publishCached, parseArgs: blazorArgs } = await import('../blazor-browser.mjs');
    assert.equal(blazorArgs(['--publish-cache', 'x']).publishCache.endsWith('x'), true);
    const dir = makeTempDir('pk-pubcache-test-');
    try {
        let calls = 0;
        const publishFn = () => { calls++; };
        assert.equal(publishCached(dir, 'p', 1, { publishFn }), true);
        assert.equal(publishCached(dir, 'p', 1, { publishFn }), false);
        assert.equal(calls, 1);
        assert.throws(() => publishCached(path.join(dir, 'f'), 'p', 1, { publishFn: () => { throw new Error('boom'); } }), /boom/);
        assert.equal(fs.existsSync(path.join(dir, 'f', '.pk-published')), false, 'a failed publish leaves no marker');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
