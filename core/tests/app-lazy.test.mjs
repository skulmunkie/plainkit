// The app's lazy services (js/app/lazy.js, #514): the entry does not import the task, notification or dialog code; a facade answers the same contract before the code has
// arrived (a stand-in handle for a task or a toast, a promise for a dialog); calls run in order once it has; an ended scope ignores calls; loadChunk only names the fixed chunks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lazyServices } from '../js/app/lazy.js';
import { loadChunk } from '../js/app/module.js';
import { setLogLevel, addLogSink } from '../js/log.js';

setLogLevel('silent');
const logs = [];
addLogSink(e => logs.push(e));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = { warn: (...a) => logs.push({ level: 'warn', a }), error: (...a) => logs.push({ level: 'error', a }), info() {}, debug() {} };
const make = () => lazyServices({ container: null, log, load: () => {} });

test('the entry graph does not reach the task, notification or dialog code', () => {
    const seen = new Set();
    const walk = f => {
        if (seen.has(f)) return;
        seen.add(f);
        for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+'(\.[^']+)'/g)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])));
    };
    walk('js/app.js');
    for (const f of ['js/tasks.js', 'js/notify.js', 'js/dialogs.js']) assert.ok(!seen.has(f), `${f} is in the entry graph. FIX: reach it only through js/app/lazy.js`);
    assert.ok(seen.has('js/app/lazy.js'));
});

test('loadChunk names only the three service chunks', async () => {
    for (const id of ['svc-tasks', 'svc-notify', 'svc-dialogs']) assert.equal(typeof (await loadChunk(id)).default, 'function');
    for (const id of ['custom', '../x', 'svc-other', '__proto__']) await assert.rejects(loadChunk(id), /not a framework chunk/);
});

test('a task run before its code has loaded answers a handle at once, runs in order, and the result arrives through handle.promise', async () => {
    const { tasks } = make();
    const scope = tasks.scope({});
    const order = [];
    const a = scope.run({ title: 'A', run: async () => { order.push('a'); return 1; } });
    const b = scope.run({ title: 'B', run: async () => { order.push('b'); return 2; } });
    assert.equal(typeof a.cancel, 'function');
    assert.equal(a.state, 'queued');
    assert.equal(await a.promise !== undefined, true);
    await b.promise;
    assert.deepEqual(order, ['a', 'b']);
    const c = scope.run({ title: 'C', run: async () => 3 });
    assert.equal(c.state === 'queued' || c.state === 'running' || c.state === 'done', true, 'once loaded the real handle answers synchronously');
    scope.end();
    tasks.destroy();
});

test('cancel asked before the code arrived reaches the real task', async () => {
    const { tasks } = make();
    const scope = tasks.scope({});
    let aborted = false;
    const h = scope.run({ title: 'Slow', cancellable: true, run: ctx => new Promise((res, rej) => ctx.signal.addEventListener('abort', () => { aborted = true; rej(new Error('cancelled')); })) });
    assert.equal(h.cancel(), false, 'before the load the answer is the default');
    await h.promise.catch(() => {});
    await new Promise(r => setTimeout(r, 10));
    assert.equal(aborted, true);
    scope.end();
    tasks.destroy();
});

test('a bad task spec is logged, not thrown, and a destroyed dialog service resolves cancelled', async () => {
    const { tasks, dialogs, notify } = make();
    logs.length = 0;
    const h = tasks.scope({}).run({});
    await h.promise;
    assert.ok(logs.some(e => e.level === 'error'), 'the TypeError of the real service is logged');
    dialogs.destroy();
    const d = dialogs.scope();
    assert.equal(await d.confirm({ title: 'x' }), false);
    assert.equal(await d.alert({ title: 'x' }), undefined);
    assert.equal(await d.prompt({ title: 'x' }), null);
    notify.destroy();
    tasks.destroy();
});

test('after end() a scope ignores calls with a warning, and a toast stand-in has dismiss() and open', async () => {
    const { notify } = make();
    const scope = notify.scope();
    const t = scope.info('Saved');
    assert.equal(typeof t.dismiss, 'function');
    assert.equal(t.open, true);
    t.dismiss();
    scope.end();
    logs.length = 0;
    const late = scope.warn('Late');
    assert.equal(typeof late.dismiss, 'function');
    assert.ok(logs.some(e => e.level === 'warn'));
    await late.dismiss();
    notify.destroy();
});
