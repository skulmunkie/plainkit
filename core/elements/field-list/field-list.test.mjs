// Unit tests for pk-field-list: the heading shows for the prop or the slot. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './field-list.js';

const make = (heading, slotted = []) => {
    const head = { hidden: null }; let watched = null;
    const el = new (behaviour(class { part() { return head; } slotted() { return slotted; } watchSlot(n) { watched = n; } requestUpdate() {} }))();
    el.heading = heading;
    return { el, head, watched: () => watched };
};

test('the heading is hidden when neither the prop nor the slot has one', () => {
    const { el, head } = make('');
    el.updated();
    assert.equal(head.hidden, true);
});

test('the prop or the slot shows it', () => {
    const a = make('Details'); a.el.updated(); assert.equal(a.head.hidden, false);
    const b = make('', [{}]); b.el.updated(); assert.equal(b.head.hidden, false);
});

test('the heading slot is watched', () => {
    const { el, watched } = make('');
    el.connected();
    assert.equal(watched(), 'heading');
});
