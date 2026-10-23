// The hang protections of scripts/blazor-browser.mjs (#1764): per-case timeout, whole-run watchdog, teardown escalation, kill only recorded pids. Fake children and timers, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { withTimeout, createRunGuard, stopChild, runWatchdogMs } from '../blazor-browser-guard.mjs';

const fakeChild = (pid, { diesOnTerm = true } = {}) => {
    const c = new EventEmitter();
    Object.assign(c, { pid, exitCode: null, killed: [] });
    c.kill = sig => { c.killed.push(sig); if (diesOnTerm) { c.exitCode = 0; c.emit('exit', 0); } return true; };
    return c;
};

test('withTimeout: resolves, passes rejections through, and a hang fails naming the case', async () => {
    assert.equal(await withTimeout(Promise.resolve(7), 50, 'a'), 7);
    await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 50, 'a'), /boom/);
    await assert.rejects(withTimeout(new Promise(() => {}), 20, 'markdown-editor-bind'), /markdown-editor-bind.*did not finish within 0\.02 s/);
});

test('stopChild: graceful exit needs no tree kill', async () => {
    const c = fakeChild(11), killed = [];
    assert.equal(await stopChild(c, { graceMs: 50, killTree: ch => killed.push(ch.pid) }), 'graceful');
    assert.deepEqual(killed, []);
});

test('stopChild: a child that ignores the request is tree-killed after the grace period, and a stuck kill is bounded', async () => {
    const c = fakeChild(12, { diesOnTerm: false }), killed = [];
    assert.equal(await stopChild(c, { graceMs: 20, killTree: ch => killed.push(ch.pid), waitAfterKillMs: 20 }), 'unconfirmed');
    assert.deepEqual(killed, [12]);
    const d = fakeChild(13, { diesOnTerm: false });
    assert.equal(await stopChild(d, { graceMs: 20, killTree: ch => { ch.exitCode = 1; ch.emit('exit', 1); } }), 'killed');
    assert.equal(await stopChild(null), 'none');
});

test('run guard: expiry prints WATCHDOG with the last case and phase, kills only recorded pids and exits non-zero', () => {
    const lines = [], killed = [], exits = [];
    let fire;
    const g = createRunGuard({ ms: 1000, log: l => lines.push(l), killPid: p => killed.push(p), exit: c => exits.push(c), setTimer: f => { fire = f; return 1; }, clearTimer: () => {} });
    g.record(111); g.record(222); g.record(undefined);
    g.phase('running case'); g.caseName('markdown-editor-bind');
    g.phase('stopping the host');
    fire();
    assert.match(lines.join('\n'), /WATCHDOG.*1 s.*markdown-editor-bind.*stopping the host/);
    assert.deepEqual(killed.sort(), [111, 222]);
    assert.deepEqual(exits, [3]);
    g.forget(111);
    assert.deepEqual(g.pids(), [222]);
});

test('run guard: disarm cancels the timer', () => {
    let cleared = 0;
    const g = createRunGuard({ ms: 5, log() {}, killPid() {}, exit() {}, setTimer: () => 9, clearTimer: t => { if (t === 9) cleared++; } });
    g.disarm();
    assert.equal(cleared, 1);
});

test('runWatchdogMs: default 25 minutes, PK_BB_TIMEOUT_MS overrides, junk is ignored', () => {
    assert.equal(runWatchdogMs({}), 25 * 60 * 1000);
    assert.equal(runWatchdogMs({ PK_BB_TIMEOUT_MS: '90000' }), 90000);
    assert.equal(runWatchdogMs({ PK_BB_TIMEOUT_MS: 'x' }), 25 * 60 * 1000);
});
