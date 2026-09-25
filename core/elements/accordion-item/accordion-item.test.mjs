// Unit tests for pk-accordion-item: the native details element and the open prop stay in step. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './accordion-item.js';

const make = (open = false) => {
    const details = { open, listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } }; const emitted = []; const props = {}; const actions = { offsetWidth: 80 }; const heading = { style: {} }; globalThis.ResizeObserver = class { constructor(fn) { actions.slot = fn; } observe() {} disconnect() { actions.gone = true; } };
    const el = new (behaviour(class { part(n) { return n === 'details' ? details : n === 'actions' ? actions : n === 'heading' ? heading : null; } emit(n, d) { emitted.push([n, d]); return true; } }))();
    el.open = open;
    return { el, details, emitted, actions, props: heading.style };
};

test('a toggle the user made updates open and announces it with pk-toggle', () => {
    const { el, details, emitted } = make(false);
    el.connected();
    details.open = true; details.listeners.toggle();
    assert.equal(el.open, true);
    assert.deepEqual(emitted, [['pk-toggle', { open: true }]]);
    details.open = false; details.listeners.toggle();
    assert.deepEqual(emitted.at(-1), ['pk-toggle', { open: false }]);
});

test('a toggle that only mirrors the prop does not echo an event', () => {
    const { el, details, emitted } = make(true);
    el.connected();
    details.listeners.toggle();
    assert.deepEqual(emitted, []);
});

test('updated pushes the open prop into the details element', () => {
    const { el, details } = make(false);
    el.open = true; el.updated();
    assert.equal(details.open, true);
    el.open = false; el.updated();
    assert.equal(details.open, false);
});

test('connecting twice registers one listener', () => {
    const { el, details } = make();
    el.connected(); const first = details.listeners.toggle;
    el.connected();
    assert.equal(details.listeners.toggle, first);
});

test('the heading reserves the actions width plus a gap, and nothing without actions', () => {
    const { el, actions, props } = make();
    el.connected(); actions.slot();
    assert.equal(props.paddingInlineEnd, 'calc(80px + var(--space-3))');
    actions.offsetWidth = 0; actions.slot();
    assert.equal(props.paddingInlineEnd, '');
});

test('the size observer is released on disconnect', () => {
    const { el, actions } = make();
    el.connected(); el.disconnected();
    assert.equal(actions.gone, true);
});
