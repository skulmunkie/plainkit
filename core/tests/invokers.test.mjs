// data-open / data-toggle / data-close: the declarative overlay openers (js/invokers.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInvoker, runInvoker, initInvokers } from '../js/invokers.js';
import { setLogLevel, getLogBuffer, clearLogBuffer } from '../js/log.js';

// A tiny element tree: closest() walks up, matching a selector list of attribute or tag names.
const el = (tag, attrs = {}, parent = null, calls = []) => {
    const node = {
        tag, attrs, parent, calls,
        getAttribute: k => attrs[k] ?? null,
        show() { calls.push('show'); }, hide() { calls.push('hide'); }, toggle() { calls.push('toggle'); },
        closest(sel) {
            const parts = sel.split(',').map(s => s.trim());
            for (let n = node; n; n = n.parent) if (parts.some(p => (p.startsWith('[') ? p.slice(1, -1) in n.attrs : p === n.tag))) return n;
            return null;
        },
    };
    return node;
};
const root = targets => ({ querySelector: sel => targets[sel] ?? null, addEventListener(type, fn) { this.handler = fn; } });

test('data-open resolves to the element its selector names', () => {
    const dialog = el('pk-dialog', { id: 'confirm' });
    const button = el('pk-button', { 'data-open': '#confirm' });
    assert.deepEqual(resolveInvoker(button, root({ '#confirm': dialog })), { type: 'open', element: dialog });
});

test('data-toggle resolves to a toggle, and data-close to the overlay the control sits in', () => {
    const pop = el('pk-popover');
    assert.equal(resolveInvoker(el('pk-button', { 'data-toggle': '#p' }), root({ '#p': pop })).type, 'toggle');
    const dialog = el('pk-dialog');
    const cancel = el('pk-button', { 'data-close': '' }, dialog);
    assert.deepEqual(resolveInvoker(cancel, root({})), { type: 'close', element: dialog });
});

test('a control inside an opener counts (a click on its label), and nothing else does', () => {
    const dialog = el('pk-dialog');
    const button = el('pk-button', { 'data-open': '#d' });
    const label = el('span', {}, button);
    assert.equal(resolveInvoker(label, root({ '#d': dialog })).type, 'open');
    assert.equal(resolveInvoker(el('span'), root({})), null);
});

test('a missing target, an empty selector and a data-close outside any overlay do nothing', () => {
    assert.equal(resolveInvoker(el('b', { 'data-open': '#nope' }), root({})), null);
    assert.equal(resolveInvoker(el('b', { 'data-open': '' }), root({})), null);
    assert.equal(resolveInvoker(el('b', { 'data-close': '' }), root({})), null);
    const throwing = { querySelector() { throw new SyntaxError('bad selector'); } };
    assert.equal(resolveInvoker(el('b', { 'data-open': '###' }), throwing), null, 'an invalid selector is not a crash');
});

test('runInvoker calls show, toggle or hide, and reports whether it did anything', () => {
    const calls = [];
    const target = el('pk-dialog', {}, null, calls);
    assert.equal(runInvoker({ type: 'open', element: target }), true);
    assert.equal(runInvoker({ type: 'toggle', element: target }), true);
    assert.equal(runInvoker({ type: 'close', element: target }), true);
    assert.deepEqual(calls, ['show', 'toggle', 'hide']);
    assert.equal(runInvoker(null), false);
});

test('initInvokers installs one listener per root and it opens the dialog on a click', () => {
    const dialog = el('pk-dialog', { id: 'd' });
    const r = root({ '#d': dialog });
    let added = 0;
    const original = r.addEventListener.bind(r);
    r.addEventListener = (t, f) => { added++; original(t, f); };
    initInvokers(r); initInvokers(r);
    assert.equal(added, 1);
    r.handler({ target: el('pk-button', { 'data-open': '#d' }) });
    assert.deepEqual(dialog.calls, ['show']);
});

test('a mistake on the page is logged, not swallowed: unmatched, empty and invalid selectors and a stray data-close', () => {
    const original = console.warn; console.warn = () => {};
    setLogLevel('warn'); clearLogBuffer();
    try {
        resolveInvoker(el('b', { 'data-open': '#nope' }), root({}));
        resolveInvoker(el('b', { 'data-open': '' }), root({}));
        resolveInvoker(el('b', { 'data-open': '###' }), { querySelector() { throw new SyntaxError('bad'); } });
        resolveInvoker(el('b', { 'data-close': '' }), root({}));
    } finally { console.warn = original; }
    const messages = getLogBuffer().filter(e => e.scope === 'invokers' && e.level === 'warn').map(e => e.message);
    assert.equal(messages.length, 4);
    assert.match(messages[0], /data-open="#nope" matched no element/);
    assert.match(messages[1], /data-open is empty/);
    assert.match(messages[2], /not a valid selector/);
    assert.match(messages[3], /data-close is not inside/);
    clearLogBuffer();
});

test('elements install the openers on demand: each connecting root is wired once, however many overlays connect', () => {
    const doc = root({});
    let added = 0;
    const original = doc.addEventListener.bind(doc);
    doc.addEventListener = (type, fn) => { added++; original(type, fn); };
    for (let i = 0; i < 5; i++) initInvokers(doc); // five overlays connecting, as pk-dialog, pk-drawer and pk-popover each do
    assert.equal(added, 1);
    const other = root({});
    other.addEventListener = () => { added++; };
    initInvokers(other);
    assert.equal(added, 2, 'a different root is wired separately');
});

test('the dialog, drawer and popover sources each call initInvokers from connected()', async () => {
    const { readFileSync } = await import('node:fs');
    for (const name of ['dialog', 'drawer', 'popover']) {
        const src = readFileSync(new URL(`../elements/${name}/${name}.js`, import.meta.url), 'utf8');
        assert.match(src, /initInvokers\(this\.ownerDocument\)/, `pk-${name} installs the openers`);
    }
});
