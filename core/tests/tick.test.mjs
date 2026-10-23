// js/tick.js (#1665): a period after each settle, no overlap, stop, abort, and a failing tick that does not end the loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { every } from '../js/tick.js';
import { setLogLevel } from '../js/log.js';

setLogLevel('silent');
const wait = ms => new Promise(r => setTimeout(r, ms));
// Waits for what is observed, not for a guessed time: on a loaded machine a fixed sleep decides nothing (#1754). The cap is only there so a bug fails instead of hanging.
const until = async (cond, what, cap = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > cap) assert.fail(`timed out waiting for ${what}`); await wait(2); } };

test('every runs after each period, never overlaps a slow tick, and stop ends it', async () => {
    let calls = 0, running = 0, overlap = false;
    const stop = every(5, async () => { calls++; running++; overlap ||= running > 1; await wait(12); running--; });
    await until(() => calls >= 3, 'three ticks');
    stop();
    await until(() => running === 0, 'the tick in flight to finish');
    const seen = calls;
    await wait(60); // a negative check: nothing may run after stop, so there is nothing to observe but quiet
    assert.equal(overlap, false); assert.equal(calls, seen, 'nothing runs after stop');
});

test('a throwing tick is logged and the loop goes on; an aborted signal stops it', async () => {
    let calls = 0; const ac = new AbortController();
    every(5, () => { calls++; throw new Error('poll failed'); }, { signal: ac.signal });
    await until(() => calls >= 2, 'two failing ticks');
    ac.abort(); await wait(5); const seen = calls; await wait(60);
    assert.ok(calls <= seen + 1, 'an aborted signal stops the loop');
    let late = 0; every(5, () => { late++; }, { signal: AbortSignal.abort() });
    await wait(60); assert.equal(late, 0, 'an already aborted signal never starts');
});
