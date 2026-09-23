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
