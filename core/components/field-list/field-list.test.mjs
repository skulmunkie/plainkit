// Unit tests for pk-field-list: the heading shows for the prop or the slot, and the pure rowVisible rule items rows use to hide
// themselves. DOM rendering of items (paint()) is covered by the browser cases; this stub has no document. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour, { rowVisible, emptyPairs } from './field-list.js';

globalThis.MutationObserver ??= class { observe() {} disconnect() {} }; // connected() watches the slotted pairs; this stub has no document

const make = (heading, slotted = []) => {
    const head = { hidden: null };
    const items = { replaceChildren() {}, append() {} };
    const watched = [];
    const parts = { heading: head, items };
    const shadowRoot = { querySelector: () => null }; // no <template>, so paint() sees an empty items array and never touches it
    const el = new (behaviour(class {
        constructor() { this.shadowRoot = shadowRoot; }
        part(n) { return parts[n]; }
        slotted() { return slotted; }
        watchSlot(n) { watched.push(n); }
        requestUpdate() {}
    }))();
    el.heading = heading;
    return { el, head, watched: () => watched, hideFor: slotted };
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

test('the heading and the default slot are watched', () => {
    const { el, watched } = make('');
    el.connected();
    assert.deepEqual(watched(), ['heading', '']);
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

const node = (name, text = '', kids = 0) => ({ localName: name, textContent: text, children: { length: kids }, hidden: false });

test('emptyPairs: a dt whose dds have no text and no element is an empty pair, with its dds', () => {
    const [t1, d1, t2, d2, t3, d3] = [node('dt', 'A'), node('dd', '  '), node('dt', 'B'), node('dd', 'x'), node('dt', 'C'), node('dd', '', 1)];
    assert.deepEqual(emptyPairs([t1, d1, t2, d2, t3, d3]), [t1, d1]);
});

test('emptyPairs: a dt is empty only when every dd of the pair is, and a dt with no dd is left alone', () => {
    const [t, a, b, lone] = [node('dt'), node('dd'), node('dd', 'y'), node('dt')];
    assert.deepEqual(emptyPairs([t, a, b, lone]), []);
});

test('updated hides empty slotted pairs, unless showEmpty, and shows them again when a value appears', () => {
    const [t, d] = [node('dt', 'A'), node('dd')];
    const { el } = make('', [t, d]);
    el.updated();
    assert.equal(t.hidden && d.hidden, true);
    d.textContent = 'now';
    el.updated();
    assert.equal(t.hidden || d.hidden, false);
    d.textContent = ''; el.updated(); assert.equal(t.hidden, true);
    el.showEmpty = true; el.updated(); assert.equal(t.hidden || d.hidden, false);
});

test('updated never un-hides a pair the author hid', () => {
    const [t, d] = [node('dt', 'A'), node('dd', 'v')];
    t.hidden = true;
    const { el } = make('', [t, d]);
    el.updated();
    assert.equal(t.hidden, true);
});
