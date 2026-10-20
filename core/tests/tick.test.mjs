// js/tick.js (#1665): a period after each settle, no overlap, stop, abort, and a failing tick that does not end the loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { every } from '../js/tick.js';
import { setLogLevel } from '../js/log.js';

setLogLevel('silent');
const wait = ms => new Promise(r => setTimeout(r, ms));

test('every runs after each period, never overlaps a slow tick, and stop ends it', async () => {
    let calls = 0, running = 0, overlap = false;
    const stop = every(5, async () => { calls++; running++; overlap ||= running > 1; await wait(12); running--; });
    await wait(80); stop();
    const seen = calls;
    await wait(40);
    assert.ok(seen >= 2, 'ticked repeatedly'); assert.equal(overlap, false); assert.equal(calls, seen, 'nothing runs after stop');
});

test('a throwing tick is logged and the loop goes on; an aborted signal stops it', async () => {
    let calls = 0; const ac = new AbortController();
    every(5, () => { calls++; throw new Error('poll failed'); }, { signal: ac.signal });
    await wait(40); assert.ok(calls >= 2);
    ac.abort(); const seen = calls; await wait(30); assert.ok(calls <= seen + 1);
    let late = 0; every(5, () => { late++; }, { signal: AbortSignal.abort() });
    await wait(30); assert.equal(late, 0, 'an already aborted signal never starts');
});
