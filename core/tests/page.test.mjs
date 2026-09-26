// A page's own state, built from elements the host already placed in its markup (js/page.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPage, messageFor } from '../js/page.js';
import { addLogSink } from '../js/log.js';

class El {
    constructor(tag) { this.localName = tag; this.children = []; this.text = ''; this.hidden = false; }
    append(...kids) { for (const k of kids) this.children.push(k); }
    replaceChildren(...kids) { this.children = kids; }
    get textContent() { return this.text; }
    set textContent(v) { this.text = v; this.children = []; }
}
function fakeDom() {
    globalThis.document = { title: '', createElement: t => new El(t) };
}

test('messageFor: an Error\'s own message, a string as-is, anything else stringified, never throws', () => {
    assert.equal(messageFor(new Error('boom')), 'boom');
    assert.equal(messageFor(new Error('')), 'Error');
    assert.equal(messageFor('plain'), 'plain');
    assert.equal(messageFor(404), '404');
    assert.equal(messageFor({ toString() { throw new Error('nope'); } }), 'Something went wrong.');
});

test('setTitle sets document.title and, if given a title element, its text', () => {
    fakeDom();
    const title = new El('h1');
    const page = createPage({ title });
    page.setTitle('Orders');
    assert.equal(globalThis.document.title, 'Orders');
    assert.equal(title.textContent, 'Orders');
});

test('setTitle with no title element still sets document.title, and never throws with no document', () => {
    fakeDom();
    const page = createPage({});
    page.setTitle('Orders');
    assert.equal(globalThis.document.title, 'Orders');
    delete globalThis.document;
    assert.doesNotThrow(() => page.setTitle('Orders'));
});

test('setStatus drives an alert-shaped element: kind, heading, message text, and un-hides it; clearStatus hides it', () => {
    const alert = new El('pk-alert');
    alert.hidden = true;
    const page = createPage({ alert });
    page.setStatus('Saved.', { kind: 'success', heading: 'Done' });
    assert.equal(alert.kind, 'success');
    assert.equal(alert.heading, 'Done');
    assert.equal(alert.textContent, 'Saved.');
    assert.equal(alert.hidden, false);
    page.clearStatus();
    assert.equal(alert.hidden, true);
});

test('setStatus defaults to kind info and an empty heading; no alert element is a silent no-op', () => {
    const alert = new El('pk-alert');
    const page = createPage({ alert });
    page.setStatus('Hi.');
    assert.equal(alert.kind, 'info');
    assert.equal(alert.heading, '');
    assert.doesNotThrow(() => createPage({}).setStatus('Hi.'));
    assert.doesNotThrow(() => createPage({}).clearStatus());
});

test('setError logs at error under the page\'s scope, and shows the message as a danger status', () => {
    fakeDom();
    const alert = new El('pk-alert');
    const entries = [];
    const remove = addLogSink(e => entries.push(e));
    try {
        const page = createPage({ alert, scope: 'orders-test' });
        page.setError(new Error('order not found'));
    } finally { remove(); }
    assert.equal(entries.length, 1);
    assert.equal(entries[0].level, 'error');
    assert.equal(entries[0].scope, 'orders-test');
    assert.equal(entries[0].message, 'order not found');
    assert.equal(alert.kind, 'danger');
    assert.equal(alert.textContent, 'order not found');
});

test('setError takes an explicit message override instead of the error\'s own', () => {
    const alert = new El('pk-alert');
    const page = createPage({ alert });
    page.setError(new Error('ORDER_404'), 'Order not found.');
    assert.equal(alert.textContent, 'Order not found.');
});

test('setBreadcrumbs replaces the trail with a elements carrying label text and href; empty clears it', () => {
    fakeDom();
    const breadcrumb = new El('pk-breadcrumb');
    const page = createPage({ breadcrumb });
    page.setBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Orders' }]);
    assert.equal(breadcrumb.children.length, 2);
    assert.equal(breadcrumb.children[0].textContent, 'Home');
    assert.equal(breadcrumb.children[0].href, '/');
    assert.equal(breadcrumb.children[1].textContent, 'Orders');
    assert.equal(breadcrumb.children[1].href, undefined);
    page.setBreadcrumbs([]);
    assert.equal(breadcrumb.children.length, 0);
});

test('busy toggles the overlay around fn, sets and clears busy, and passes through the result', async () => {
    const overlay = new El('pk-loading-overlay');
    const page = createPage({ overlay });
    const seenDuring = [];
    const result = await page.busy(async () => { seenDuring.push(overlay.busy); return 42; }, 'Loading…');
    assert.equal(result, 42);
    assert.deepEqual(seenDuring, [true]);
    assert.equal(overlay.label, 'Loading…');
    assert.equal(overlay.busy, false);
});

test('busy logs and shows a rejection as a danger status, clears busy, and rethrows', async () => {
    fakeDom();
    const overlay = new El('pk-loading-overlay');
    const alert = new El('pk-alert');
    const page = createPage({ overlay, alert });
    await assert.rejects(() => page.busy(async () => { throw new Error('network down'); }));
    assert.equal(overlay.busy, false);
    assert.equal(alert.kind, 'danger');
    assert.equal(alert.textContent, 'network down');
});

test('busy with no overlay still runs fn and still surfaces a rejection as a status', async () => {
    fakeDom();
    const alert = new El('pk-alert');
    const page = createPage({ alert });
    assert.equal(await page.busy(() => 7), 7);
    await assert.rejects(() => page.busy(() => { throw new Error('x'); }));
    assert.equal(alert.kind, 'danger');
});

// Counted busy (issue 371)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gate = () => { let go; const p = new Promise(r => { go = r; }); return [p, go]; };

test('counted busy: overlapping actions keep busy true until the last finishes; the label is the most recent still running', async () => {
    const overlay = new El('pk-loading-overlay');
    const page = createPage({ overlay, alert: new El('pk-alert') });
    const [a, endA] = gate(), [b, endB] = gate();
    const first = page.busy(() => a, 'First');
    const second = page.busy(() => b, 'Second');
    assert.equal(page.isBusy, true);
    assert.equal(page.busyLabel, 'Second');
    assert.equal(overlay.label, 'Second');
    endB(); await second;
    assert.equal(page.isBusy, true, 'the first is still running');
    assert.equal(overlay.busy, true);
    assert.equal(page.busyLabel, 'First');
    endA(); await first;
    assert.equal(page.isBusy, false);
    assert.equal(overlay.busy, false);
});

test('counted busy: a rejection releases only its own token, sets the danger status and rethrows', async () => {
    fakeDom();
    const alert = new El('pk-alert');
    const page = createPage({ alert });
    const [a, endA] = gate();
    const slow = page.busy(() => a, 'Slow');
    await assert.rejects(() => page.busy(async () => { throw new Error('bad'); }, 'Bad'));
    assert.equal(page.isBusy, true);
    assert.equal(page.busyLabel, 'Slow');
    assert.equal(alert.kind, 'danger');
    endA(); await slow;
    assert.equal(page.isBusy, false);
});

test('begin() returns an idempotent end(); onBusyChange reports busy and label changes and returns its unsubscribe', () => {
    const page = createPage({});
    const seen = [];
    const off = page.onBusyChange(s => seen.push(`${s.busy}:${s.label}`));
    const endA = page.begin('A'), endB = page.begin('B');
    endB(); endB();
    assert.equal(page.isBusy, true);
    endA();
    assert.deepEqual(seen, ['true:A', 'true:B', 'true:A', 'false:']);
    off();
    page.begin('C')();
    assert.equal(seen.length, 4);
});

test('a throwing onBusyChange listener is logged and does not break busy tracking', () => {
    const page = createPage({ scope: 'listener-test' });
    const entries = [];
    const remove = addLogSink(e => entries.push(e));
    try {
        page.onBusyChange(() => { throw new Error('nope'); });
        const end = page.begin('x');
        end();
    } finally { remove(); }
    assert.equal(page.isBusy, false);
    assert.equal(entries.filter(e => e.level === 'error').length, 2);
});

test('100 begin/end cycles and 100 create/destroy cycles leave no tokens, listeners or timers', () => {
    const timers = new Set();
    const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
    globalThis.setTimeout = (fn, ms) => { const id = realSet(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
    globalThis.clearTimeout = id => { timers.delete(id); realClear(id); };
    try {
        const overlay = new El('pk-loading-overlay');
        const page = createPage({ overlay, delay: 50, minTime: 50 });
        for (let i = 0; i < 100; i++) { const end = page.begin(`n${i}`); end(); }
        assert.equal(page.isBusy, false);
        assert.equal(timers.size, 0, 'no timer left after idle (delay cancelled: no flash)');
        assert.notEqual(overlay.busy, true);
        for (let i = 0; i < 100; i++) {
            const p = createPage({ overlay: new El('pk-loading-overlay'), delay: 5, minTime: 5 });
            p.onBusyChange(() => {}); p.begin('a'); p.begin('b');
            p.destroy();
            assert.equal(p.isBusy, false);
        }
        assert.equal(timers.size, 0, 'destroy clears its timers');
        page.destroy();
    } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
});

test('destroy releases everything; later begin/busy still run fn but track nothing', async () => {
    const overlay = new El('pk-loading-overlay');
    const page = createPage({ overlay });
    page.begin('a');
    assert.equal(overlay.busy, true);
    page.destroy(); page.destroy();
    assert.equal(page.isBusy, false);
    assert.equal(overlay.busy, false);
    assert.equal(await page.busy(() => 5, 'x'), 5);
    assert.equal(page.isBusy, false);
});

function ownedDom() {
    class Node2 extends El {
        constructor(t) { super(t); this.parent = null; this.attrs = {}; }
        append(...k) { for (const c of k) { c.parent = this; this.children.push(c); } }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
        replaceWith(n) { const p = this.parent; p.children = p.children.map(c => (c === this ? n : c)); n.parent = p; this.parent = null; }
        setAttribute(k, v) { this.attrs[k] = v; }
        removeAttribute(k) { delete this.attrs[k]; }
    }
    globalThis.document = { title: '', createElement: t => new Node2(t) };
    const root = new Node2('div'); const body = new Node2('main'); root.append(body);
    globalThis.document.body = new Node2('body');
    return { root, body };
}

test('framework-owned overlay: wraps body once, shows only after the delay, keeps the minimum time, sets aria-busy, unwraps on destroy', async () => {
    const { root, body } = ownedDom();
    const page = createPage({ body, delay: 40, minTime: 80 });
    const ov = root.children[0];
    assert.equal(ov.localName, 'pk-loading-overlay');
    assert.equal(ov.children[0], body);
    const end = page.begin('Fast');
    assert.equal(body.attrs['aria-busy'], 'true');
    assert.notEqual(ov.busy, true);
    await sleep(10); end();
    await sleep(60);
    assert.notEqual(ov.busy, true, 'no flash for an action under the delay');
    assert.equal(body.attrs['aria-busy'], undefined);
    const end2 = page.begin('Slow & <b>bold</b>');
    await sleep(60);
    assert.equal(ov.busy, true);
    assert.equal(ov.label, 'Slow & <b>bold</b>', 'the label is handed over as text');
    end2();
    assert.equal(ov.busy, true, 'still shown right after it ended (minimum time)');
    await sleep(120);
    assert.equal(ov.busy, false);
    const e3 = page.begin('Again'); await sleep(60); assert.equal(ov.busy, true);
    e3(); const e4 = page.begin('Overlap'); await sleep(120); assert.equal(ov.busy, true, 'a new action during the hold keeps it shown'); e4();
    page.destroy();
    assert.equal(root.children[0], body, 'destroy puts the body back');
});

test('fullscreen (app scope) creates a fullscreen overlay on the document body and removes it on destroy', () => {
    ownedDom();
    const page = createPage({ fullscreen: true, delay: 0 });
    const ov = globalThis.document.body.children[0];
    assert.equal(ov.fullscreen, true);
    page.begin('x');
    assert.equal(ov.busy, true);
    page.destroy();
    assert.equal(globalThis.document.body.children.length, 0);
});
