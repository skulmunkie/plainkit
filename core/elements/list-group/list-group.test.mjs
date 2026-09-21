// Unit tests for pk-list-group: list semantics for the host and its rows. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './list-group.js';

const row = role => { const attrs = role ? { role } : {}; return { attrs, hasAttribute: n => n in attrs, setAttribute(n, v) { attrs[n] = v; } }; };
const make = (label, rows = []) => {
    const calls = [];
    const el = new (behaviour(class { aria(m) { calls.push(m); } slotted() { return rows; } watchSlot() {} requestUpdate() {} }))();
    el.label = label;
    return { el, calls };
};

test('the host is a list and takes the label as its name', () => {
    const { el, calls } = make('Files');
    el.connected(); el.updated();
    assert.deepEqual(calls, [{ role: 'list' }, { ariaLabel: 'Files' }]);
});

test('an empty label is not announced', () => {
    const { el, calls } = make('');
    el.updated();
    assert.deepEqual(calls, [{ ariaLabel: null }]);
});

test('rows become listitems unless they already have a role', () => {
    const plain = row(); const custom = row('link');
    const { el } = make('', [plain, custom]);
    el.updated();
    assert.equal(plain.attrs.role, 'listitem'); assert.equal(custom.attrs.role, 'link');
});
