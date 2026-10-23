// js/reconnect.js (#1714, phase 1): the Blazor Server reconnect policy as pure logic. Event names are the ones measured on .NET 10 (docs/superpowers/specs/2026-10-22-blazor-reconnect-ui-design.md, section 8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { STATES, DEFAULTS, backoffDelay, createGuard, createReconnect } from '../js/reconnect.js';
import { setLogLevel } from '../js/log.js';

setLogLevel('silent');

/** A fake environment: a manual clock whose timers run when `tick(ms)` advances it, a recording reload and a scripted probe. */
function env(over = {}) {
    let now = 1000, seq = 0; const timers = new Map(), views = [], calls = { reload: 0, probe: [], resume: 0 };
    const e = {
        now: () => now, rand: () => 0.5, visible: () => true,
        setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
        clearTimeout: id => timers.delete(id),
        reload: () => { calls.reload++; },
        resume: () => { calls.resume++; },
        probe: async url => { calls.probe.push(now); return e.probeResult; },
        probeResult: false,
        storage: new Map(),
        onView: v => views.push(v),
        ...over,
    };
    e.storage = { getItem: k => e.store.get(k) ?? null, setItem: (k, v) => e.store.set(k, v), ...(over.storage ?? {}) };
    e.store = over.store ?? new Map();
    const tick = async ms => { const end = now + ms; for (;;) { const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; timers.delete(due[0]); now = Math.max(now, due[1].at); due[1].fn(); await Promise.resolve(); await Promise.resolve(); } now = end; };
    return { e, tick, views, calls, timers, last: () => views[views.length - 1] };
}

test('the states are the ones measured on .NET 10', () => {
    assert.deepEqual([...STATES], ['show', 'retrying', 'failed', 'rejected', 'resume-failed', 'paused', 'hide']);
});

test('backoff doubles from 1 s to a 30 s cap, jitter stays within its bounds', () => {
    const o = DEFAULTS, base = [1000, 2000, 4000, 8000, 15000, 30000, 30000];
    base.forEach((b, i) => assert.equal(backoffDelay(i, o, () => 0.5), b, `attempt ${i}`));
    for (let i = 0; i < 8; i++) {
        const lo = backoffDelay(i, o, () => 0), hi = backoffDelay(i, o, () => 0.999999), b = base[Math.min(i, base.length - 1)];
        assert.ok(lo >= b * (1 - o.jitter) - 1 && hi <= b * (1 + o.jitter) + 1, `jitter bounds at ${i}`);
        assert.ok(hi <= o.steps.at(-1) * 1000 * (1 + o.jitter));
    }
});

test('the loop guard allows 3 reloads per 60 s, then blocks until the oldest leaves the window', () => {
    let now = 0; const store = new Map(), g = createGuard({ getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, () => now);
    for (let i = 0; i < 3; i++) { assert.equal(g.allow(), true); g.record(); now += 1000; }
    assert.equal(g.allow(), false, 'a fourth within 60 s is refused');
    now = 59999; assert.equal(g.allow(), false);
    now = 60000; assert.equal(g.allow(), true, 'the first fell out of the window');
});

test('the loop guard survives storage that throws or holds junk', () => {
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const g = createGuard(bad, () => 0); assert.equal(g.allow(), true); g.record();
    const junk = createGuard({ getItem: () => 'not json', setItem() {} }, () => 0); assert.equal(junk.allow(), true);
    assert.equal(createGuard(null, () => 0).allow(), true);
});

test('show and retrying are a busy banner with the attempt; hide clears it', async () => {
    const t = env(), r = createReconnect(t.e);
    r.onState({ state: 'show' }); assert.equal(t.last().kind, 'busy'); assert.equal(t.last().live, 'status');
    r.onState({ state: 'retrying', currentAttempt: 2, secondsToNextAttempt: 1 }); assert.equal(t.last().attempt, 2);
    const n = t.views.length; r.onState({ state: 'retrying', currentAttempt: 2, secondsToNextAttempt: 0 }); assert.equal(t.views.length, n, 'a repeat of the same attempt is not a new announcement');
    r.onState({ state: 'hide' }); assert.equal(t.last(), null);
    assert.equal(t.calls.reload, 0);
});

test('rejected counts down 5 s visibly and reloads; cancel stops it', async () => {
    const t = env(), r = createReconnect(t.e);
    r.onState({ state: 'rejected' });
    assert.equal(t.last().kind, 'ended'); assert.equal(t.last().live, 'alert'); assert.equal(t.last().countdown, 5);
    await t.tick(2000); assert.equal(t.last().countdown, 3); assert.equal(t.calls.reload, 0);
    await t.tick(3000); assert.equal(t.calls.reload, 1);
    const c = env(), q = createReconnect(c.e); q.onState({ state: 'rejected' }); await c.tick(1000); q.cancel();
    assert.equal(c.last().countdown, null); await c.tick(10000); assert.equal(c.calls.reload, 0, 'cancelled');
});

test('resume-failed reloads the same way; autoReload never keeps both manual', async () => {
    const t = env(), r = createReconnect(t.e); r.onState({ state: 'resume-failed' }); await t.tick(5000); assert.equal(t.calls.reload, 1);
    const n = env(), q = createReconnect(n.e, { autoReload: 'never' }); q.onState({ state: 'rejected' }); await n.tick(60000);
    assert.equal(n.calls.reload, 0); assert.equal(n.last().countdown, null); assert.equal(n.last().kind, 'ended');
    q.reloadNow(); assert.equal(n.calls.reload, 1, 'the button still works');
});

test('the loop guard stops automatic reloads and says so', async () => {
    const t = env(), r = createReconnect(t.e);
    for (let i = 0; i < 4; i++) { r.onState({ state: 'rejected' }); await t.tick(5000); }
    assert.equal(t.calls.reload, 3); assert.equal(t.last().blocked, true);
});

test('failed with the default policy waits for a person; with always it probes with backoff and reloads on success', async () => {
    const t = env(), r = createReconnect(t.e); r.onState({ state: 'failed' });
    assert.equal(t.last().kind, 'failed'); await t.tick(120000); assert.equal(t.calls.probe.length, 0); assert.equal(t.calls.reload, 0);
    const a = env(), q = createReconnect(a.e, { autoReload: 'always' }); const t0 = a.e.now(); q.onState({ state: 'failed' });
    await a.tick(1000); assert.equal(a.calls.probe.length, 1); assert.equal(a.calls.reload, 0);
    await a.tick(2000); assert.equal(a.calls.probe.length, 2); await a.tick(4000); assert.equal(a.calls.probe.length, 3);
    assert.deepEqual(a.calls.probe.map(x => x - t0), [1000, 3000, 7000], 'gaps 1, 2, 4 s');
    a.e.probeResult = true; await a.tick(8000); assert.equal(a.calls.reload, 1);
});

test('the probe stops after the window and keeps the manual state; hide and dispose clear every timer', async () => {
    const a = env(), q = createReconnect(a.e, { autoReload: 'always' }); q.onState({ state: 'failed' });
    await a.tick(DEFAULTS.window + 60000); const n = a.calls.probe.length; await a.tick(120000);
    assert.equal(a.calls.probe.length, n, 'no probe after the window'); assert.equal(a.last().kind, 'failed'); assert.equal(a.last().gaveUp, true);
    const b = env(), p = createReconnect(b.e, { autoReload: 'always' }); p.onState({ state: 'failed' }); p.onState({ state: 'hide' });
    assert.equal(b.timers.size, 0); p.onState({ state: 'rejected' }); p.dispose(); assert.equal(b.timers.size, 0);
    await b.tick(60000); assert.equal(b.calls.reload, 0);
});

test('probing waits while the tab is hidden', async () => {
    let shown = false; const a = env({ visible: () => shown }), q = createReconnect(a.e, { autoReload: 'always' }); q.onState({ state: 'failed' });
    await a.tick(10000); assert.equal(a.calls.probe.length, 0);
    shown = true; await a.tick(35000); assert.ok(a.calls.probe.length >= 1);
});

test('a stale probe answer after hide does not reload', async () => {
    let release; const a = env({ probe: () => new Promise(res => { release = res; }) }), q = createReconnect(a.e, { autoReload: 'always' });
    q.onState({ state: 'failed' }); await a.tick(1000); q.onState({ state: 'hide' }); release(true); await a.tick(0);
    await Promise.resolve(); assert.equal(a.calls.reload, 0);
});

test('paused offers resume; resume() calls the environment, and an unknown state is ignored', () => {
    const t = env(), r = createReconnect(t.e); r.onState({ state: 'paused' }); assert.equal(t.last().kind, 'paused');
    r.resume(); assert.equal(t.calls.resume, 1);
    const n = t.views.length; r.onState({ state: 'something-new' }); r.onState(null); assert.equal(t.views.length, n);
});

test('copy options reach the view through the strings option', () => {
    const t = env(), r = createReconnect(t.e, { strings: { ended: 'Sitzung beendet' } }); r.onState({ state: 'rejected' });
    assert.equal(t.last().text, 'Sitzung beendet'); r.onState({ state: 'failed' }); assert.match(t.last().text, /server/i);
});
