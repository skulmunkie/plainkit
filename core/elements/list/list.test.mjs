// Unit tests for pk-list: list semantics for the host and its items. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './list.js';

const item = role => { const attrs = role ? { role } : {}; return { attrs, hasAttribute: n => n in attrs, setAttribute(n, v) { attrs[n] = v; } }; };
const make = (label, items = []) => {
    const calls = [];
    const el = new (behaviour(class { aria(m) { calls.push(m); } slotted() { return items; } watchSlot() {} requestUpdate() {} }))();
    el.label = label;
    return { el, calls };
};

test('the host is a list and takes the label as its name', () => {
    const { el, calls } = make('Shipping notes');
    el.updated();
    assert.deepEqual(calls, [{ role: 'list', ariaLabel: 'Shipping notes' }]);
});

test('an empty label is not announced', () => {
    const { el, calls } = make('');
    el.updated();
    assert.deepEqual(calls, [{ role: 'list', ariaLabel: null }]);
});

test('items become listitems unless they already have a role', () => {
    const plain = item(); const custom = item('link');
    const { el } = make('', [plain, custom]);
    el.updated();
    assert.equal(plain.attrs.role, 'listitem'); assert.equal(custom.attrs.role, 'link');
});

test('connected watches the default slot for changes', () => {
    let watched = null;
    const el = new (behaviour(class { aria() {} slotted() { return []; } watchSlot(name, fn) { watched = { name, fn }; } requestUpdate() {} }))();
    el.connected();
    assert.equal(watched.name, '');
    assert.equal(typeof watched.fn, 'function');
});
