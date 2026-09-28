// pk-kanban: the pure column rules, the drag and keyboard behaviour on a stub base, and the meta, css and source held to the standards.
// Real pointer capture, layout and the 44px handle are checked by the review scenario (core/tests/review/scenarios/kanban.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { dropIndex, dropTarget, keyDestination, announceMove } from './kanban.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./kanban.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const src = read('js');

test('dropIndex counts the midpoints the pointer is past', () => {
    assert.equal(dropIndex([20, 60], 0), 0); assert.equal(dropIndex([20, 60], 30), 1); assert.equal(dropIndex([20, 60], 99), 2); assert.equal(dropIndex([], 5), 0);
});

test('dropTarget picks the column under x, the nearest one outside them all, and an empty column takes index 0', () => {
    const cols = [{ left: 0, right: 100, mids: [20, 60] }, { left: 110, right: 210, mids: [] }, { left: 220, right: 320, mids: [30] }];
    assert.deepEqual(dropTarget(cols, 50, 40), { col: 0, index: 1 });
    assert.deepEqual(dropTarget(cols, 150, 999), { col: 1, index: 0 });
    assert.deepEqual(dropTarget(cols, 500, 999), { col: 2, index: 1 }, 'past the last column: the last one');
    assert.deepEqual(dropTarget(cols, -50, 0), { col: 0, index: 0 });
    assert.equal(dropTarget([], 0, 0), null);
});

test('keyDestination: Up and Down stay in the column, Left and Right change it and keep the row (clamped to the end), rtl mirrors', () => {
    const lens = [3, 0, 2];
    assert.deepEqual(keyDestination('ArrowDown', 0, 0, lens), { col: 0, index: 1 });
    assert.equal(keyDestination('ArrowDown', 0, 2, lens), null);
    assert.equal(keyDestination('ArrowUp', 0, 0, lens), null);
    assert.deepEqual(keyDestination('ArrowRight', 0, 2, lens), { col: 1, index: 0 }, 'into an empty column');
    assert.deepEqual(keyDestination('ArrowRight', 1, 0, lens), { col: 2, index: 0 });
    assert.deepEqual(keyDestination('ArrowLeft', 2, 1, lens), { col: 1, index: 0 });
    assert.equal(keyDestination('ArrowLeft', 0, 0, lens), null); assert.equal(keyDestination('ArrowRight', 2, 0, lens), null);
    assert.deepEqual(keyDestination('ArrowLeft', 0, 1, lens, true), { col: 1, index: 0 }, 'rtl: Left is the next column');
    assert.equal(keyDestination('x', 0, 0, lens), null);
});

test('announceMove reports a 1-based position', () => {
    assert.equal(announceMove('t1', 'Done', 1, 4), 't1 moved to Done, position 2 of 4.');
});

function card(value, top, attrs = {}) {
    return { localName: 'pk-sortable-item', value, disabled: false, tabIndex: -1, attrs, parentElement: null,
        toggleAttribute(n, on) { attrs[n] = on || undefined; }, setAttribute(n, v) { attrs[n] = v; },
        getBoundingClientRect: () => ({ top, bottom: top + 40, left: 0, right: 0 }), focus() { this.focused = true; } };
}
function column(value, left, cards) {
    const col = { localName: 'pk-kanban-column', value, label: value.toUpperCase(), attrs: {}, children: cards,
        toggleAttribute(n, on) { col.attrs[n] = on || undefined; }, getBoundingClientRect: () => ({ left, right: left + 100 }) };
    cards.forEach(c => { c.parentElement = col; });
    return col;
}
function make(cols) {
    const el = new (behaviour(class {
        emit(name, detail, init = {}) { this.events.push({ name, detail }); return !this.decline; }
        part(n) { return (this.parts ??= {})[n] ??= { textContent: '' }; }
        aria() {} watchSlot() {} requestUpdate() {} addEventListener() {}
    }))();
    Object.assign(el, { events: [], disabled: false, dragging: false, label: '', children: cols });
    return el;
}
globalThis.getComputedStyle = () => ({ direction: 'ltr' });
const board = () => { const a = [card('a', 0), card('b', 40)], b = [card('c', 0)], c = []; const cols = [column('todo', 0, a), column('doing', 110, b), column('done', 220, c)]; return { el: make(cols), a, b, cols }; };

test('a drag into another column marks it, draws the line, and pk-move carries from, to and both indexes', () => {
    const { el, a, b, cols } = board();
    el.beginDrag(a[0]);
    assert.equal(a[0].attrs.dragging, true); assert.equal(el.dragging, true);
    el.continueDrag(150, 30); // over "doing", below c's midpoint (20): after the last card
    assert.equal(cols[1].attrs['drop-target'], true); assert.ok(!cols[0].attrs['drop-target']);
    assert.equal(b[0].attrs['drop-indicator'], 'after');
    el.endDrag(false);
    assert.ok(!cols[1].attrs['drop-target'], 'cleared on drop'); assert.equal(a[0].attrs.dragging, undefined);
    assert.deepEqual(el.events, [{ name: 'pk-move', detail: { item: 'a', from: 'todo', to: 'doing', fromIndex: 0, toIndex: 1 } }]);
    assert.equal(el.part('announcer').textContent, 'a moved to DOING, position 2 of 2.');
});

test('a drag into an empty column drops at index 0; one that ends where it started, or is cancelled, raises nothing', () => {
    const { el, a } = board();
    el.beginDrag(a[1]); el.continueDrag(250, 0); el.endDrag(false);
    assert.deepEqual(el.events[0].detail, { item: 'b', from: 'todo', to: 'done', fromIndex: 1, toIndex: 0 });
    const s = board(); s.el.beginDrag(s.a[0]); s.el.continueDrag(50, 0); s.el.endDrag(false);
    assert.equal(s.el.events.length, 0, 'same column, same index');
    const c = board(); c.el.beginDrag(c.a[0]); c.el.continueDrag(150, 0); c.el.endDrag(true);
    assert.equal(c.el.events.length, 0);
});

test('a host that cancels pk-move is told in the live region', () => {
    const { el, a } = board(); el.decline = true;
    el.beginDrag(a[0]); el.continueDrag(150, 0); el.endDrag(false);
    assert.match(el.part('announcer').textContent, /cancelled/);
});

test('Alt+Right moves the focused card to the next column and announces it; Alt at an edge does nothing but is still swallowed', () => {
    const { el, a } = board();
    let prevented = 0;
    const key = (k, alt, t) => el.onKey({ key: k, altKey: alt, target: { closest: () => t }, preventDefault() { prevented++; } });
    key('ArrowRight', true, a[1]);
    assert.deepEqual(el.events[0].detail, { item: 'b', from: 'todo', to: 'doing', fromIndex: 1, toIndex: 1 });
    assert.equal(el.part('announcer').textContent, 'b moved to DOING, position 2 of 2.');
    key('ArrowLeft', true, a[0]);
    assert.equal(el.events.length, 1); assert.equal(prevented, 2);
});

test('plain arrows move focus between cards and columns (skipping empty ones), and a disabled board does nothing', () => {
    const { el, a, b } = board();
    const key = (k, t) => el.onKey({ key: k, altKey: false, target: { closest: () => t }, preventDefault() {} });
    key('ArrowDown', a[0]); assert.equal(a[1].focused, true);
    key('ArrowRight', a[1]); assert.equal(b[0].focused, true, 'row clamped to the last card of the next column');
    const d = board(); d.el.disabled = true; d.el.onKey({ key: 'ArrowRight', altKey: true, target: { closest: () => d.a[0] }, preventDefault() {} });
    assert.equal(d.el.events.length, 0);
});

test('updated keeps exactly one card in the tab order across the whole board', () => {
    const { el, a, b } = board(); b[0].tabIndex = 0;
    el.updated();
    assert.deepEqual([...a, ...b].map(c => c.tabIndex), [-1, -1, 0]);
});

test('the meta declares a cancelable pk-move with both columns and indexes, and the writes to the children', () => {
    const ev = meta.events.find(e => e.name === 'pk-move');
    assert.equal(ev.cancelable, true);
    assert.deepEqual(Object.keys(ev.detailProps), ['item', 'from', 'to', 'fromIndex', 'toIndex']);
    assert.deepEqual(meta.writes[0].attributes.sort(), ['dragging', 'drop-indicator', 'drop-target', 'tabindex']);
    assert.match(meta.a11y, /Alt\+Left/);
});

test('the css uses tokens only, and the source never changes DOM structure or listens on document or window', () => {
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
    assert.ok(css.includes('clip-path'));
    assert.ok(!/\.(appendChild|insertBefore|removeChild|replaceChildren|append|prepend|remove)\(/.test(src));
    assert.ok(!/\b(document|window)\s*\.\s*addEventListener|innerHTML/.test(src));
});
