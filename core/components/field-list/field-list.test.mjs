// Unit tests for pk-field-list: the heading shows for the prop or the slot, and the pure rowVisible rule items rows use to hide
// themselves. DOM rendering of items (paint()) is covered by the browser cases; this stub has no document. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour, { rowVisible } from './field-list.js';

const make = (heading, slotted = []) => {
    const head = { hidden: null };
    const items = { replaceChildren() {}, append() {} };
    let watched = null;
    const parts = { heading: head, items };
    const shadowRoot = { querySelector: () => null }; // no <template>, so paint() sees an empty items array and never touches it
    const el = new (behaviour(class {
        constructor() { this.shadowRoot = shadowRoot; }
        part(n) { return parts[n]; }
        slotted() { return slotted; }
        watchSlot(n) { watched = n; }
        requestUpdate() {}
    }))();
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

test('rowVisible: a row with a value shows', () => {
    assert.equal(rowVisible({ label: 'SKU', value: 'AC-001' }, false), true);
});

test('rowVisible: an empty value (null, undefined or empty string) hides the row unless showEmpty is set (issue #207)', () => {
    for (const value of [null, undefined, '']) {
        assert.equal(rowVisible({ label: 'PO', value }, false), false);
        assert.equal(rowVisible({ label: 'PO', value }, true), true);
    }
});

test('rowVisible: hidden always hides the row, even with showEmpty and a value', () => {
    assert.equal(rowVisible({ label: 'Secret', value: 'x', hidden: true }, true), false);
});

test('rowVisible: a value of 0 or false is not empty', () => {
    assert.equal(rowVisible({ label: 'Count', value: 0 }, false), true);
    assert.equal(rowVisible({ label: 'Flag', value: false }, false), true);
});
