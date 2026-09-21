// Unit tests for pk-hint: the toggle button, aria-expanded and the pk-toggle event. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './hint.js';

const make = (open = false) => {
    const attrs = {}; const toggle = { listeners: [], addEventListener(t, fn) { this.listeners.push(fn); }, setAttribute: (n, v) => { attrs[n] = v; } };
    const panel = { hidden: null }; const emitted = [];
    const el = new (behaviour(class { part(n) { return n === 'toggle' ? toggle : panel; } emit(n, d) { emitted.push([n, d]); return true; } }))();
    el.open = open;
    return { el, toggle, panel, attrs, emitted };
};

test('pressing the button flips open and announces the new state', () => {
    const { el, toggle, emitted } = make();
    el.connected();
    toggle.listeners[0]();
    assert.equal(el.open, true);
    toggle.listeners[0]();
    assert.equal(el.open, false);
    assert.deepEqual(emitted, [['pk-toggle', { open: true }], ['pk-toggle', { open: false }]]);
});

test('updated mirrors open into aria-expanded and the panel', () => {
    const closed = make(false); closed.el.updated();
    assert.equal(closed.attrs['aria-expanded'], 'false'); assert.equal(closed.panel.hidden, true);
    const open = make(true); open.el.updated();
    assert.equal(open.attrs['aria-expanded'], 'true'); assert.equal(open.panel.hidden, false);
});

test('connecting twice adds one listener', () => {
    const { el, toggle } = make();
    el.connected(); el.connected();
    assert.equal(toggle.listeners.length, 1);
});
