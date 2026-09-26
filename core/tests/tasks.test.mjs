// The task manager (js/tasks.js, #372): states, queue and concurrency, progress and details throttling, cancel, timeout, failure text and retry, busy tokens, scopes (the unmount
// policy), the composition of the toast, and that 100 cycles leave no listener, timer or node. A fake clock and a small DOM double stand in for the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTasks, failureText, FAILED_TEXT, DONE_DELAY, PROGRESS_INTERVAL, DETAILS_INTERVAL } from '../js/tasks.js';
import { setLogLevel, addLogSink } from '../js/log.js';

setLogLevel('silent');
const logs = [];
addLogSink(e => logs.push(e));

// ---- a fake clock: setTimeout/clearTimeout/Date.now, counting what is pending ----
const clock = { t: 0, next: 1, timers: new Map() };
const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };
function installClock() {
    clock.t = 0; clock.timers.clear();
    globalThis.setTimeout = (fn, ms = 0) => { const id = clock.next++; clock.timers.set(id, { at: clock.t + ms, fn }); return id; };
    globalThis.clearTimeout = id => { clock.timers.delete(id); };
    Date.now = () => clock.t;
}
function restoreClock() { Object.assign(globalThis, { setTimeout: real.setTimeout, clearTimeout: real.clearTimeout }); Date.now = real.now; }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
async function tick(ms) {
    const end = clock.t + ms;
    for (;;) {
        await flush();
        const due = [...clock.timers].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        clock.timers.delete(due[0]); clock.t = Math.max(clock.t, due[1].at); due[1].fn();
    }
    clock.t = end; await flush();
}

// ---- a DOM double: the parts of pk-toast, pk-progress, pk-button and pk-toast-stack the manager touches ----
let listeners = 0, nodes = 0;
class El {
    constructor(tag, doc) { this.localName = tag; this.ownerDocument = doc; this.children = []; this.parent = null; this.attrs = new Map(); this.on = new Map(); this.hidden = false; this._text = ''; nodes++; }
    get isConnected() { return !!this.parent; }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
    append(...kids) { for (const k of kids) { k.parent?.children.splice(k.parent.children.indexOf(k), 1); k.parent = this; this.children.push(k); } }
    remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; nodes--; this.children.forEach(c => { c.parent = null; nodes--; c.children.forEach(() => { nodes--; }); }); } }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    removeAttribute(k) { this.attrs.delete(k); }
    addEventListener(t, fn) { if (!this.on.has(t)) this.on.set(t, new Set()); if (!this.on.get(t).has(fn)) { this.on.get(t).add(fn); listeners++; } }
    removeEventListener(t, fn) { if (this.on.get(t)?.delete(fn)) listeners--; }
    fire(t, e = {}) { const ev = { type: t, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...e }; for (const fn of [...(this.on.get(t) ?? [])]) fn(ev); return ev; }
    click() { this.fire('click'); }
    // pk-toast: a click on an action button dismisses with reason 'action' (the element does it); dismiss emits a cancelable pk-dismiss and removes the toast unless prevented
    dismiss(reason = 'method') { if (!this.fire('pk-dismiss', { detail: { reason } }).defaultPrevented) this.remove(); }
    all() { return this.children.flatMap(c => [c, ...c.all()]); }
    find(tag) { return this.all().filter(e => e.localName === tag); }
}
function makeDom() {
    const doc = { createElement: tag => new El(tag, doc) };
    doc.body = doc.createElement('body'); doc.body.parent = {}; // connected
    doc.querySelector = () => null;
    return doc;
}
// pk-toast wires its action buttons: clicking one dismisses with reason 'action'. The double does the same when a button in slot="action" is clicked.
function wire(toast) { toast.append = function (...kids) { El.prototype.append.apply(this, kids); for (const k of kids) if (k.localName === 'pk-button') { const orig = k.fire.bind(k); k.fire = (t, e) => { const r = orig(t, e); if (t === 'click') this.dismiss('action'); return r; }; } }; }
function setup(opts = {}) {
    installClock(); listeners = 0; nodes = 0; logs.length = 0;
    const doc = makeDom(), busyLog = [];
    const create = doc.createElement;
    doc.createElement = tag => { const e = create(tag); if (tag === 'pk-toast') wire(e); return e; };
    globalThis.document = doc;
    const busy = label => { busyLog.push(`+${label}`); let open = true; return () => { if (open) { open = false; busyLog.push(`-${label}`); } }; };
    const tasks = createTasks({ container: doc.body, busy, ...opts });
    const stack = () => doc.body.find('pk-toast-stack')[0];
    const toasts = () => (stack()?.children ?? []).filter(c => c.localName === 'pk-toast');
    return { tasks, doc, busyLog, stack, toasts };
}
const gate = () => { let ok, no; const p = new Promise((a, b) => { ok = a; no = b; }); return { p, ok, no }; };
const parts = t => ({ details: t.children[0], bar: t.children[1], action: t.children.find(c => c.localName === 'pk-button') });

test('failureText: an error message only when it is userFacing === true, else the generic text; never markup handling', () => {
    assert.equal(failureText(Object.assign(new Error('Disk full'), { userFacing: true })), 'Disk full');
    assert.equal(failureText(new Error('ECONNRESET at 10.0.0.4:5432')), FAILED_TEXT);
    assert.equal(failureText(Object.assign(new Error('x'), { userFacing: 'yes' })), FAILED_TEXT);
    assert.equal(failureText(null), FAILED_TEXT);
    assert.equal(failureText(Object.assign(new Error(''), { userFacing: true })), FAILED_TEXT);
});

test('a task goes queued -> running -> done; its toast is composed from pk-toast, a details line and a pk-progress, sticky, then dismisses itself', async t => {
    const { tasks, toasts, stack } = setup();
    t.after(() => { tasks.destroy(); restoreClock(); });
    const g = gate();
    const h = tasks.run({ title: 'Import <b>orders</b>', details: 'Reading…', run: async ctx => { await g.p; return 42; } });
    assert.equal(h.state, 'running');
    assert.match(h.id, /^task-\d+$/);
    assert.equal(stack().getAttribute('position'), 'bottom-end');
    const [toast] = toasts();
    assert.equal(toast.heading, 'Import <b>orders</b>', 'the title is text on a property, never markup');
    assert.equal(toast.duration, 0, 'sticky');
    assert.equal(toast.kind, 'info');
    const { details, bar } = parts(toast);
    assert.equal(details.textContent, 'Reading…');
    assert.equal(bar.indeterminate, true, 'no progress call yet: indeterminate');
    assert.equal(bar.label, 'Running');
    assert.equal(bar.getAttribute('aria-live'), 'off');
    g.ok();
    const r = await h.promise;
    assert.deepEqual(r, { state: 'done', value: 42 });
    assert.equal(h.state, 'done');
    assert.equal(bar.getAttribute('aria-live'), null, 'the end is announced');
    assert.equal(toast.kind, 'success'); assert.equal(bar.value, 100); assert.equal(bar.indeterminate, false); assert.equal(bar.label, 'Done');
    assert.equal(toasts().length, 1, 'still there right after success');
    await tick(DONE_DELAY - 1); assert.equal(toasts().length, 1);
    await tick(2); assert.equal(toasts().length, 0, 'dismissed shortly after success');
});

test('the toast is updated in place: the same nodes for the whole life, and unchanged values write nothing', async t => {
    const { tasks, toasts } = setup();
    t.after(() => { tasks.destroy(); restoreClock(); });
    const g = gate();
    const h = tasks.run({ title: 'Sync', run: async ctx => { ctx.progress(10, 40); await g.p; } });
    const [toast] = toasts(); const { details, bar } = parts(toast);
    const before = nodes;
    await tick(PROGRESS_INTERVAL); // a call right after the start paints when the interval since the last paint has passed
    assert.equal(bar.value, 10); assert.equal(bar.max, 40); assert.equal(bar.indeterminate, false); assert.equal(bar.showValue, true);
    g.ok(); await h.promise;
    assert.equal(toasts()[0], toast); assert.equal(parts(toast).details, details); assert.equal(parts(toast).bar, bar);
    assert.ok(nodes <= before, 'no node was created for updates');
});

test('progress and details are throttled: one paint per interval, the newest value wins, state changes are immediate', async t => {
    const { tasks, toasts } = setup();
    t.after(() => { tasks.destroy(); restoreClock(); });
    const g = gate(); let ctxRef;
    const h = tasks.run({ title: 'Big', run: async ctx => { ctxRef = ctx; await g.p; } });
    const { details, bar } = parts(toasts()[0]);
    await tick(PROGRESS_INTERVAL);
    ctxRef.progress(1);
    assert.equal(bar.value, 1, 'the first update after a quiet interval paints at once');
    ctxRef.details('one');
    for (let i = 2; i <= 50; i++) { ctxRef.progress(i); ctxRef.details(`row ${i}`); }
    assert.equal(bar.value, 1, 'inside the interval nothing is painted');
    assert.ok(clock.timers.size <= 1, `one timer for the burst, found ${clock.timers.size}`);
    await tick(PROGRESS_INTERVAL);
    assert.equal(bar.value, 50, 'the newest progress wins');
    assert.equal(details.textContent, '', 'details wait for their own, longer interval (announcements)');
    await tick(DETAILS_INTERVAL - PROGRESS_INTERVAL);
    assert.equal(details.textContent, 'row 50');
    ctxRef.progress(NaN); ctxRef.progress(3, 0);
    await tick(PROGRESS_INTERVAL);
    assert.equal(bar.indeterminate, true, 'an invalid value goes back to indeterminate');
    g.ok(); await h.promise;
    assert.equal(clock.timers.size, 1, 'only the auto-dismiss timer is left');
});

test('a queue with max concurrency: order kept, queued state and toast, the next starts when one ends, cancel of a queued task', async t => {
    const { tasks, toasts } = setup({ concurrency: 2 });
    t.after(() => { tasks.destroy(); restoreClock(); });
    const gs = [gate(), gate(), gate(), gate()], started = [];
    const hs = gs.map((g, i) => tasks.run({ title: `T${i}`, cancellable: i === 3, run: async () => { started.push(i); await g.p; } }));
    assert.deepEqual(hs.map(h => h.state), ['running', 'running', 'queued', 'queued']);
    assert.equal(tasks.running, 2); assert.equal(tasks.active, 4);
    const q = parts(toasts()[2]);
    assert.equal(q.bar.label, 'Queued'); assert.equal(q.details.textContent, 'Waiting for a free slot.'); assert.equal(q.bar.value, 0);
    gs[0].ok(); await hs[0].promise; await flush();
    assert.deepEqual(started, [0, 1, 2], 'FIFO');
    assert.equal(hs[2].state, 'running'); assert.equal(hs[3].state, 'queued');
    assert.equal(hs[3].cancel(), true);
    assert.equal(hs[3].state, 'cancelled'); assert.deepEqual(await hs[3].promise, { state: 'cancelled' });
    gs[1].ok(); gs[2].ok(); await Promise.all(hs.map(h => h.promise));
    assert.deepEqual(started, [0, 1, 2], 'a cancelled queued task never starts');
    assert.equal(tasks.running, 0); assert.equal(tasks.active, 0);
});

test('cancel aborts the signal and ends cancelled at once; the Cancel button does the same; a non-cancellable task has no button and cancel() refuses', async t => {
    const { tasks, toasts } = setup();
    t.after(() => { tasks.destroy(); restoreClock(); });
    let sig;
    const h = tasks.run({ title: 'Export', cancellable: true, run: ctx => { sig = ctx.signal; return new Promise((_, no) => ctx.signal.addEventListener('abort', () => no(new Error('aborted')))); } });
    const toast = toasts()[0];
    assert.equal(parts(toast).action.textContent, 'Cancel');
    assert.equal(toast.noClose, true, 'a running toast has no close button');
    parts(toast).action.click(); // the toast turns the click into a dismiss with reason action, which the manager turns into cancel
    assert.equal(sig.aborted, true); assert.equal(h.state, 'cancelled');
    assert.deepEqual(await h.promise, { state: 'cancelled' });
    assert.equal(toasts().length, 1, 'the toast stays to say it was cancelled');
    assert.equal(toast.kind, 'warning'); assert.equal(parts(toast).details.textContent, ''); assert.equal(parts(toast).details.hidden, true); assert.equal(parts(toast).bar.label, 'Cancelled'); assert.equal(toast.noClose, false);
    await tick(DONE_DELAY + 1); assert.equal(toasts().length, 0);
    const g = gate();
    const h2 = tasks.run({ title: 'Fixed', run: () => g.p });
    assert.equal(parts(toasts()[0]).action, undefined);
    assert.equal(h2.cancel(), false); assert.equal(h2.state, 'running');
    g.ok(); await h2.promise;
    assert.equal(h2.cancel(), false, 'cancel after the end does nothing');
});

test('a running toast cannot be dismissed; Escape dismisses a finished one', async t => {
    const { tasks, toasts } = setup();
    t.after(() => { tasks.destroy(); restoreClock(); });
    const g = gate();
    const h = tasks.run({ title: 'X', run: () => g.p });
    const toast = toasts()[0];
    toast.dismiss('close'); assert.equal(toasts().length, 1, 'refused while running');
    toast.fire('keydown', { key: 'Escape' }); assert.equal(toasts().length, 1);
    g.ok(); await h.promise;
    toast.fire('keydown', { key: 'Escape' }); assert.equal(toasts().length, 0);
});

test('failure: the raw message is not shown, the generic text is, the detail is logged; userFacing shows the message; Retry runs the task again', async t => {
    const { tasks, toasts } = setup();
    t.after(() => { tasks.destroy(); restoreClock(); });
    setLogLevel('error');
    let n = 0;
    const h = tasks.run({ title: 'Upload', retry: true, run: async () => { n++; if (n === 1) throw new Error('SELECT * FROM secrets failed'); return 'ok'; } });
    const r = await h.promise;
    assert.equal(r.state, 'failed'); assert.equal(r.error.message, 'SELECT * FROM secrets failed', 'the caller gets the error');
    const toast = toasts()[0];
    assert.equal(toast.kind, 'danger'); assert.equal(parts(toast).details.textContent, FAILED_TEXT);
    assert.ok(logs.some(e => e.level === 'error' && /Upload/.test(e.message)), 'the detail goes to the logger');
    setLogLevel('silent');
    assert.equal(parts(toast).action.textContent, 'Retry');
    await tick(60000); assert.equal(toasts().length, 1, 'a failure stays until dismissed');
    parts(toast).action.click();
    assert.equal(toasts().length, 1, 'the old toast is replaced by the new task\'s');
    assert.notEqual(toasts()[0], toast);
    await flush();
    assert.equal(n, 2);
    const u = tasks.run({ title: 'Save', run: async () => { throw Object.assign(new Error('The name is taken.'), { userFacing: true }); } });
    await u.promise;
    assert.equal(parts(toasts().at(-1)).details.textContent, 'The name is taken.');
    assert.equal(parts(toasts().at(-1)).action, undefined, 'no retry without retry: true');
    const s = tasks.run({ title: 'Sync throw', run: () => { throw new Error('sync'); } });
    assert.equal((await s.promise).state, 'failed', 'a synchronous throw is a failure too');
});

test('a timeout aborts the signal and ends failed with its own text', async t => {
    const { tasks, toasts } = setup();
    t.after(() => { tasks.destroy(); restoreClock(); });
    let sig;
    const h = tasks.run({ title: 'Slow', timeout: 5000, run: ctx => { sig = ctx.signal; return new Promise(() => {}); } });
    await tick(4999); assert.equal(h.state, 'running');
    await tick(2);
    assert.equal(h.state, 'failed'); assert.equal(sig.aborted, true);
    assert.equal(parts(toasts()[0]).details.textContent, 'Timed out after 5 s.');
    assert.equal((await h.promise).state, 'failed');
});

test('a blocking task holds a busy token while it runs and releases it on every ending; a non-blocking one never does', async t => {
    const { tasks, busyLog } = setup();
    t.after(() => { tasks.destroy(); restoreClock(); });
    const g = gate();
    const a = tasks.run({ title: 'A', blocking: true, run: () => g.p });
    tasks.run({ title: 'B', run: async () => {} });
    assert.deepEqual(busyLog, ['+A']);
    g.ok(); await a.promise;
    assert.deepEqual(busyLog, ['+A', '-A']);
    const f = tasks.run({ title: 'F', blocking: true, run: async () => { throw new Error('x'); } });
    await f.promise;
    const c = tasks.run({ title: 'C', blocking: true, cancellable: true, run: () => new Promise(() => {}) });
    c.cancel();
    assert.deepEqual(busyLog, ['+A', '-A', '+F', '-F', '+C', '-C']);
});

test('the unmount policy: a scope cancels its cancellable tasks and detaches the rest, which continue and keep their toast', async t => {
    const { tasks, toasts, busyLog } = setup();
    t.after(() => { tasks.destroy(); restoreClock(); });
    const page = tasks.scope({ busy: label => { busyLog.push(`page+${label}`); return () => busyLog.push(`page-${label}`); } });
    const g = gate();
    const can = page.run({ title: 'Cancellable', cancellable: true, blocking: true, run: ctx => new Promise((_, no) => ctx.signal.addEventListener('abort', () => no(new Error('a')))) });
    const keep = page.run({ title: 'Keeps going', blocking: true, run: () => g.p });
    const other = tasks.run({ title: 'App level', run: () => g.p });
    page.end();
    assert.equal(can.state, 'cancelled');
    assert.equal(keep.state, 'running'); assert.equal(other.state, 'running');
    assert.deepEqual(busyLog.filter(l => l.startsWith('page')).sort(), ['page+Cancellable', 'page+Keeps going', 'page-Cancellable', 'page-Keeps going'], 'the page holds no busy token after it ended');
    assert.equal(toasts().length, 3, 'every toast is still there');
    g.ok(); assert.equal((await keep.promise).state, 'done');
    assert.equal(parts(toasts().find(x => x.heading === 'Keeps going')).bar.label, 'Done', 'a detached task still updates its toast');
});

test('a bad spec throws a TypeError naming the fix; a destroyed manager refuses; destroy cancels, clears timers and removes its toasts and its own stack', async t => {
    const { tasks, toasts, stack } = setup();
    t.after(() => restoreClock());
    assert.throws(() => tasks.run({ title: 'x' }), TypeError);
    assert.throws(() => tasks.run({ run() {} }), /title/);
    assert.throws(() => tasks.run(null), TypeError);
    let sig;
    tasks.run({ title: 'a', cancellable: true, run: ctx => { sig = ctx.signal; return new Promise(() => {}); } });
    tasks.run({ title: 'b', timeout: 1000, run: () => new Promise(() => {}) });
    const s = stack();
    tasks.destroy();
    assert.equal(sig.aborted, true); assert.equal(toasts().length, 0); assert.equal(s.isConnected, false);
    assert.equal(clock.timers.size, 0); assert.equal(listeners, 0);
    assert.throws(() => tasks.run({ title: 'c', run() {} }), /destroyed/);
    tasks.destroy();
});

test('an existing bottom-end stack (the shell\'s) is reused and left in place', async t => {
    installClock(); t.after(restoreClock);
    const doc = makeDom(); const shellStack = doc.createElement('pk-toast-stack'); doc.body.append(shellStack);
    doc.querySelector = sel => (sel === 'pk-toast-stack[position="bottom-end"]' ? shellStack : null);
    globalThis.document = doc;
    const tasks = createTasks({ container: doc.body });
    tasks.run({ title: 'x', run: async () => {} });
    assert.equal(shellStack.children.length, 1); assert.equal(doc.body.find('pk-toast-stack').length, 1);
    tasks.destroy();
    assert.equal(shellStack.isConnected, true); assert.equal(shellStack.children.length, 0);
});

test('a toast that cannot be built does not stop the task', async t => {
    const { tasks, doc } = setup();
    t.after(() => { tasks.destroy(); restoreClock(); });
    setLogLevel('silent');
    doc.body.append = () => { throw new Error('no stack'); };
    const h = tasks.run({ title: 'x', run: async () => 7 });
    assert.deepEqual(await h.promise, { state: 'done', value: 7 });
});

test('100 run/complete/dismiss cycles (done, failed, cancelled, timed out) leave zero listeners, timers and nodes', async t => {
    const { tasks, toasts, stack } = setup({ doneDelay: 10 });
    t.after(() => restoreClock());
    const base = { nodes, listeners, timers: clock.timers.size };
    for (let i = 0; i < 100; i++) {
        const kind = i % 4;
        const h = tasks.run({ title: `t${i}`, cancellable: kind === 2, timeout: kind === 3 ? 50 : 0, retry: kind === 1, blocking: i % 2 === 0,
            run: async ctx => { ctx.progress(1, 2); ctx.details('x'); if (kind === 1) throw new Error('boom'); if (kind >= 2) await new Promise(() => {}); } });
        await flush();
        if (kind === 2) h.cancel();
        if (kind === 3) await tick(60);
        await h.promise;
        await tick(20);
        for (const x of toasts()) x.dismiss('close'); // failed ones stay until dismissed
    }
    await tick(1000);
    assert.equal(toasts().length, 0);
    assert.equal(clock.timers.size, base.timers, `timers left: ${clock.timers.size}`);
    assert.equal(tasks.active, 0); assert.equal(tasks.running, 0);
    const st = stack();
    assert.equal(st.children.length, 0);
    assert.equal(listeners, st.on.size ? [...st.on.values()].reduce((n, s) => n + s.size, 0) : 0, `listeners left: ${listeners}`);
    tasks.destroy();
    assert.equal(nodes, base.nodes + 0, `DOM nodes left: ${nodes - base.nodes}`);
    assert.equal(listeners, 0);
});
