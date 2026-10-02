import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightRow } from '../js/listbox.js';

const row = id => {
    const attrs = new Map(), classes = new Set();
    return { id, attrs, classes, scrolled: [],
        setAttribute: (k, v) => attrs.set(k, v),
        toggleAttribute(k, on) { if (on) attrs.set(k, ''); else attrs.delete(k); },
        classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
        scrollIntoView(o) { this.scrolled.push(o); } };
};
const control = () => { const a = new Map(); return { a, setAttribute: (k, v) => a.set(k, v), removeAttribute: k => a.delete(k) }; };

test('highlightRow with a class marks one row, points the control at it and scrolls it nearest', () => {
    const rows = [row('a'), row('b')], c = control();
    highlightRow(rows, rows[0], c, 'hl'); highlightRow(rows, rows[1], c, 'hl');
    assert.deepEqual(rows.map(r => r.classes.has('hl')), [false, true]);
    assert.equal(c.a.get('aria-activedescendant'), 'b');
    assert.deepEqual(rows[1].scrolled, [{ block: 'nearest' }]);
});
test('highlightRow with a data- mark uses the attribute, and no row clears everything', () => {
    const rows = [row('a'), row('b')], c = control();
    highlightRow(rows, rows[0], c, 'data-active');
    assert.deepEqual(rows.map(r => r.attrs.has('data-active')), [true, false]);
    highlightRow(rows, null, c, 'data-active');
    assert.deepEqual(rows.map(r => r.attrs.has('data-active')), [false, false]);
    assert.equal(c.a.has('aria-activedescendant'), false);
});
test('highlightRow tolerates a row without scrollIntoView', () => {
    const r = row('a'); r.scrollIntoView = undefined;
    assert.doesNotThrow(() => highlightRow([r], r, control(), 'hl'));
});
