// js/page-base.js (#1929 step 2): once, startRun, the mixin over a bare element class, and the size cap that keeps it from becoming the place page logic accumulates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageBase, once, startRun, endRuns } from '../js/page-base.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tick = () => new Promise(r => setImmediate(r));
const deferred = () => { const d = {}; d.promise = new Promise((res, rej) => { d.res = res; d.rej = rej; }); return d; };

test('once runs the body for the first call only', () => {
    const host = {}, other = {};
    let n = 0;
    assert.equal(once(host, () => n++), true);
    assert.equal(once(host, () => n++), false);
    assert.equal(once(other, () => n++), true);
    assert.equal(n, 2);
});

test('startRun drops a superseded result and aborts its signal', async () => {
    const host = {}, a = deferred(), b = deferred(), got = [];
    let first;
    startRun(host, 'k', s => { first = s; return a.promise; }).then(v => got.push(v));
    startRun(host, 'k', () => b.promise).then(v => got.push(v));
    assert.equal(first.aborted, true);
    a.res('old'); b.res('new');
    await tick();
    assert.deepEqual(got, ['new']);
    endRuns(host);
});

test('the mixin ends runs on disconnect, calls the base disconnected, and runs again after reconnect', async () => {
    const calls = [];
    class Bare { disconnected() { calls.push('base'); } }
    const Page = pageBase(Bare), el = new Page(), d = deferred(), got = [];
    let sig;
    el.startRun('k', s => { sig = s; return d.promise; }).then(v => got.push(v));
    el.disconnected();
    assert.equal(sig.aborted, true);
    d.res('late');
    await tick();
    assert.deepEqual(got, []);
    assert.deepEqual(calls, ['base']);
    assert.equal(await el.startRun('k', async () => 'fresh'), 'fresh');
    assert.equal(el.once(() => {}), true);
    assert.equal(el.once(() => {}), false);
    el.disconnected();
});

test('the mixin works over a base with no disconnected, and a failed run reaches the page state once', async () => {
    const el = new (pageBase(class {}))(), seen = [];
    el.page = { setError: e => seen.push(e.message) };
    await assert.rejects(el.startRun('k', async () => { throw new Error('boom'); }), /boom/);
    assert.deepEqual(seen, ['boom']);
    el.disconnected();
});

test('page-base stays small and out of the base class', () => {
    const src = fs.readFileSync(path.join(here, '../js/page-base.js'), 'utf8');
    const code = src.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('//')).length;
    assert.ok(code <= 45, `page-base.js has ${code} code lines (cap 45): page logic belongs in the page type, not the shared base`);
    assert.ok(Buffer.byteLength(src) <= 3600, 'page-base.js source grew past 3600 bytes');
    const element = fs.readFileSync(path.join(here, '../js/element.js'), 'utf8');
    assert.ok(!/page-base/.test(element), 'PkElement must not import the page base (rule 10)');
});
