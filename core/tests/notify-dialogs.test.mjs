// Notifications and the dialog factory (js/notify.js, js/dialogs.js, #373): kinds and durations, the shared stack, dedupe, the kept maximum, scopes (notifications
// finish, dialogs cancel), confirm / alert / prompt / open results, the one-at-a-time queue, blocking and backdrop policy, focus in and back, validation, a throwing
// config, and that 100 cycles of each leave no listener, timer or node. A small DOM double stands in for the browser (the review scenarios show the real thing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotify, INFO_DURATION, WARN_DURATION, DEDUPE_WINDOW } from '../js/notify.js';
import { createDialogs } from '../js/dialogs.js';
import { createTasks } from '../js/tasks.js';
import { setLogLevel, addLogSink } from '../js/log.js';

setLogLevel('silent');
const logs = [];
addLogSink(e => logs.push(e));

let listeners = 0, nodes = 0, timers = 0;
const realST = globalThis.setTimeout, realCT = globalThis.clearTimeout;
class El {
    constructor(tag, doc) { this.localName = tag; this.ownerDocument = doc; this.children = []; this.parent = null; this.attrs = new Map(); this.on = new Map(); this.dataset = {}; this._text = ''; nodes++; }
    get isConnected() { let p = this; while (p.parent) p = p.parent; return p === this.ownerDocument.root; }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); }
    append(...kids) { for (const k of kids) { if (k.frag) { this.append(...k.children); continue; } k.detach(); k.parent = this; this.children.push(k); } }
    detach() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    remove() { if (!this.parent) return; this.detach(); const gone = n => { nodes--; n.children.forEach(gone); }; gone(this); }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    closest(sel) { const k = sel.slice(6, -1); for (let n = this; n; n = n.parent) if (k in n.dataset) return n; return null; }
    focus() { this.ownerDocument.activeElement = this; }
    addEventListener(t, fn) { if (!this.on.has(t)) this.on.set(t, new Set()); if (!this.on.get(t).has(fn)) { this.on.get(t).add(fn); listeners++; } }
    removeEventListener(t, fn) { if (this.on.get(t)?.delete(fn)) listeners--; }
    fire(t, e = {}, target = this) {
        const ev = { type: t, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, composedPath: () => [target], ...e };
        for (let n = target; n; n = n.parent) for (const fn of [...(n.on.get(t) ?? [])]) fn(ev);
        return ev;
    }
    click() { this.fire('click'); }
    all() { return this.children.flatMap(c => [c, ...c.all()]); }
    find(tag) { return this.all().filter(e => e.localName === tag); }
}
// pk-toast: dismiss raises a cancelable pk-dismiss and removes itself (it owns its timer: counted here to prove the managers add none of their own).
class Toast extends El { dismiss(reason = 'method') { if (!this.fire('pk-dismiss', { detail: { reason } }).defaultPrevented) this.remove(); } }
// pk-dialog: open=true raises pk-open; open=false closes and raises close; a close request (Escape, close button) raises a cancelable pk-close first.
class Dialog extends El {
    get open() { return !!this._open; }
    set open(v) { const was = this._open; this._open = !!v; if (v && !was) this.fire('pk-open'); if (!v && was) this.fire('close'); }
    request(reason) { if (!this.fire('pk-close', { detail: { reason } }).defaultPrevented) this.open = false; }
}
function makeDom() {
    const doc = { activeElement: null, byId: new Map() };
    doc.createElement = tag => new (tag === 'pk-toast' ? Toast : tag === 'pk-dialog' ? Dialog : El)(tag, doc);
    doc.root = doc.createElement('html'); doc.body = doc.createElement('body'); doc.root.append(doc.body);
    doc.querySelector = sel => doc.root.all().find(e => e.localName === 'pk-toast-stack' && sel.includes(`"${e.getAttribute('position')}"`)) ?? null;
    doc.getElementById = id => doc.byId.get(id) ?? null;
    globalThis.document = doc;
    nodes = 0; listeners = 0; logs.length = 0;
    return doc;
}
const bd = { composedPath: () => [{ localName: 'dialog' }] }; // a click on the backdrop: the native dialog in the shadow tree is the first target
const flush = () => new Promise(r => realST(r, 0));
const dialogOf = doc => doc.body.find('pk-dialog')[0];
const btn = (doc, label) => dialogOf(doc).find('pk-button').find(b => b.textContent === label);

test('notify: kinds map to toast kinds and durations (error sticky), text goes in as properties, into ONE stack shared with the task manager', () => {
    const doc = makeDom();
    const n = createNotify({ container: doc.body }), tasks = createTasks({ container: doc.body });
    n.info('Imported', '12 rows'); n.success('Saved'); n.warn('Low stock', '<b>3</b> left'); n.error('Sync failed');
    tasks.run({ title: 'Export', run: () => new Promise(() => {}) });
    const stacks = doc.body.find('pk-toast-stack');
    assert.equal(stacks.length, 1, 'the task manager reuses the stack notify made');
    const t = stacks[0].children.map(x => [x.kind, x.heading, x.message ?? '', x.duration]);
    assert.deepEqual(t.slice(0, 4), [['info', 'Imported', '12 rows', INFO_DURATION], ['success', 'Saved', '', INFO_DURATION], ['warning', 'Low stock', '<b>3</b> left', WARN_DURATION], ['danger', 'Sync failed', '', 0]]);
    assert.equal(stacks[0].children[2].children.length, 0, 'details are a property, never parsed into nodes');
    assert.equal(n.success('x', '', { duration: 0 }) && stacks[0].children.at(-1).duration, 0, 'opts.duration overrides');
    tasks.destroy(); n.destroy();
});

test('notify: an identical kind+title within the window returns the first (details updated); after the window or once dismissed it stacks again; max keeps the newest', () => {
    const doc = makeDom(), realNow = Date.now;
    let now = 1000; Date.now = () => now;
    try {
        const n = createNotify({ container: doc.body, max: 3 });
        const a = n.warn('Offline', 'retrying');
        assert.equal(n.warn('Offline', 'retrying in 5 s'), a);
        assert.equal(n.active, 1); assert.equal(doc.body.find('pk-toast')[0].message, 'retrying in 5 s');
        assert.notEqual(n.info('Offline'), a, 'another kind is another notification');
        now += DEDUPE_WINDOW; n.warn('Offline');
        assert.equal(n.active, 3);
        a.dismiss(); assert.equal(a.open, false);
        n.error('A'); n.error('B'); n.error('C');
        assert.equal(n.active, 3); assert.deepEqual(doc.body.find('pk-toast').map(t => t.heading), ['A', 'B', 'C'], 'the oldest were dropped');
        assert.equal(n.info(''), null, 'no title: logged, not thrown');
        assert.ok(logs.some(l => l.level === 'error' && /needs a title/.test(l.detail?.message ?? l.message)));
        n.destroy();
        assert.equal(doc.body.find('pk-toast-stack').length, 0, 'destroy removes the stack it made');
    } finally { Date.now = realNow; }
});

test('notify: an ended scope lets its toasts finish and ignores later calls; an existing (shell) stack is reused and left in place', () => {
    const doc = makeDom();
    const shell = doc.createElement('pk-toast-stack'); shell.setAttribute('position', 'bottom-end'); doc.body.append(shell);
    const n = createNotify({ container: doc.body }), sc = n.scope();
    sc.success('Order saved');
    sc.end();
    assert.equal(sc.info('late'), null);
    assert.equal(shell.children.length, 1, 'the toast stays after its scope ended');
    n.destroy();
    assert.equal(shell.children.length, 0); assert.ok(shell.isConnected, 'the shell stack stays');
});

test('dialogs: confirm, alert, prompt and open resolve with the choice; cancel values; focus goes in and back to the trigger', async () => {
    const doc = makeDom(), d = createDialogs({ container: doc.body });
    const trigger = doc.createElement('pk-button'); doc.body.append(trigger); trigger.focus();
    let p = d.confirm({ heading: 'Delete order 1042?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
    assert.equal(dialogOf(doc).heading, 'Delete order 1042?'); assert.equal(dialogOf(doc).find('p')[0].textContent, 'This cannot be undone.');
    assert.equal(doc.activeElement, btn(doc, 'Cancel'), 'a destructive confirm focuses Cancel');
    btn(doc, 'Delete').click();
    assert.equal(await p, true); assert.equal(dialogOf(doc), undefined); assert.equal(doc.activeElement, trigger);
    p = d.confirm({ heading: 'Sure?' }); dialogOf(doc).request('escape'); assert.equal(await p, false);
    p = d.alert({ heading: 'Done' }); assert.deepEqual(dialogOf(doc).find('pk-button').map(b => b.textContent), ['OK']); btn(doc, 'OK').click(); assert.equal(await p, undefined);
    p = d.prompt({ heading: 'Rename', label: 'Name', value: '  Draft  ', required: true });
    const input = dialogOf(doc).find('pk-input')[0];
    assert.equal(doc.activeElement, input); assert.equal(dialogOf(doc).find('pk-field')[0].label, 'Name');
    input.value = ' '; btn(doc, 'OK').click();
    assert.equal(dialogOf(doc).find('pk-field')[0].error, 'This field is required.', 'invalid: it stays open with the error');
    input.value = ' Final '; input.fire('keydown', { key: 'Enter' });
    assert.equal(await p, 'Final');
    p = d.prompt({ heading: 'Rename' }); btn(doc, 'Cancel').click(); assert.equal(await p, null);
    const tpl = doc.createElement('template'); tpl.content = doc.createElement('frag'); tpl.content.cloneNode = () => { const f = doc.createElement('frag'); f.frag = true; f.append(Object.assign(doc.createElement('p'), { textContent: 'From the template' })); return f; };
    doc.byId.set('tpl-new', tpl);
    p = d.open({ heading: 'New customer', template: 'tpl-new', fields: [{ name: 'email', label: 'Email', type: 'email', required: true }], actions: [{ label: 'Create', value: 'create' }], validate: v => (v.email.includes('@') ? '' : 'Enter an email address.') });
    assert.equal(dialogOf(doc).find('p')[0].textContent, 'From the template'); assert.equal(dialogOf(doc).find('pk-input')[0].type, 'email');
    dialogOf(doc).find('pk-input')[0].value = 'nobody'; btn(doc, 'Create').click();
    assert.equal(dialogOf(doc).find('pk-field')[0].error, 'Enter an email address.');
    dialogOf(doc).find('pk-input')[0].value = 'a@example.com'; btn(doc, 'Create').click();
    assert.deepEqual(await p, { action: 'create', values: { email: 'a@example.com' } });
    d.destroy();
});

test('dialogs: one at a time app-wide (the rest queue), blocking refuses Escape and the close button, backdrop only when asked', async () => {
    const doc = makeDom(), d = createDialogs({ container: doc.body });
    const a = d.confirm({ heading: 'A', blocking: true }), b = d.alert({ heading: 'B', backdrop: true });
    assert.equal(doc.body.find('pk-dialog').length, 1); assert.equal(d.queued, 1);
    assert.equal(dialogOf(doc).hideClose, true);
    dialogOf(doc).request('escape'); dialogOf(doc).fire('click', bd, dialogOf(doc)); // a blocking dialog ignores both
    assert.equal(dialogOf(doc).heading, 'A');
    btn(doc, 'Confirm').click(); assert.equal(await a, true);
    assert.equal(dialogOf(doc).heading, 'B', 'the queued one opens next');
    dialogOf(doc).fire('click', bd, dialogOf(doc)); // composedPath()[0] is the dialog: a backdrop click
    assert.equal(await b, undefined); assert.equal(d.isOpen, false);
    const c = d.confirm({ heading: 'C' });
    dialogOf(doc).fire('click', bd, dialogOf(doc));
    assert.equal(dialogOf(doc).heading, 'C', 'no backdrop close unless config.backdrop');
    d.destroy(); assert.equal(await c, false);
});

test('dialogs: an ended scope cancels its open and queued dialogs and not the others; a throwing config resolves cancelled and the next opens', async () => {
    const doc = makeDom(), d = createDialogs({ container: doc.body }), mod = d.scope();
    const other = d.confirm({ heading: 'Other' }), mine = mod.prompt({ heading: 'Mine' }), mine2 = mod.confirm({ heading: 'Mine 2' });
    mod.end();
    assert.equal(await mine, null); assert.equal(await mine2, false);
    assert.equal(dialogOf(doc).heading, 'Other');
    assert.equal(await mod.confirm({ heading: 'late' }), false);
    btn(doc, 'Confirm').click(); assert.equal(await other, true);
    const bad = { get heading() { throw new Error('boom'); } };
    assert.equal(await d.open(bad), null);
    const missing = d.open({ heading: 'T', template: 'missing' }), after = d.alert({ heading: 'After' });
    assert.equal(await missing, null);
    assert.ok(logs.filter(l => l.level === 'error').length >= 2);
    assert.equal(dialogOf(doc).heading, 'After', 'the next one opens'); btn(doc, 'OK').click(); await after;
    const v = d.open({ heading: 'V', fields: [{ name: 'x' }], validate: () => { throw new Error('bad validate'); } });
    btn(doc, 'OK').click(); assert.equal(dialogOf(doc).heading, 'V', 'a throwing validate keeps it open');
    d.destroy(); assert.equal(await v, null);
});

test('100 notify and 100 dialog cycles leave zero listeners, timers and nodes', async () => {
    const doc = makeDom();
    globalThis.setTimeout = (...a) => { timers++; return realST(...a); }; globalThis.clearTimeout = realCT;
    try {
        const shell = doc.createElement('pk-toast-stack'); shell.setAttribute('position', 'bottom-end'); doc.body.append(shell); // the shell's stack, as in an app
        const n = createNotify({ container: doc.body }), d = createDialogs({ container: doc.body });
        const base = { nodes, listeners, timers };
        for (let i = 0; i < 100; i++) {
            const sc = n.scope(), ds = d.scope();
            sc.info(`Saved ${i}`, 'details'); sc.error(`Failed ${i}`); sc.success(`Saved ${i}`, 'again');
            const p = ds.confirm({ heading: `Q ${i}` }), q = ds.prompt({ heading: `P ${i}` });
            btn(doc, 'Confirm').click(); await p;
            if (i % 2) { dialogOf(doc).find('pk-input')[0].value = 'v'; btn(doc, 'OK').click(); } else ds.end();
            await q;
            for (const t of doc.body.find('pk-toast')) t.dismiss('close');
            sc.end(); ds.end();
        }
        await flush();
        const stack = doc.body.find('pk-toast-stack')[0];
        assert.equal(stack.children.length, 0);
        assert.equal(nodes - base.nodes, 0, `nodes left: ${nodes - base.nodes}`);
        assert.equal(listeners - base.listeners, 0, `listeners left: ${listeners - base.listeners}`);
        assert.equal(timers - base.timers, 0, 'the managers start no timer of their own');
        assert.equal(n.active, 0); assert.equal(d.isOpen, false); assert.equal(d.queued, 0);
        console.log(`100 cycles: +${nodes - base.nodes} nodes, +${listeners - base.listeners} listeners, +${timers - base.timers} timers`);
        n.destroy(); d.destroy();
        assert.equal(nodes, 1, 'only the shell stack is left'); assert.equal(listeners, 0);
    } finally { globalThis.setTimeout = realST; }
});
