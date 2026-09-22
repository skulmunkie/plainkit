// pk-sortable: the pure reorder rules, the drag and keyboard behaviour on a stub base, and the meta, css and source held to the standards.
// Real pointer capture, layout and the 44px handle are checked in the browser suite (core/tests/browser/cases-layout.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { moveOrder, keyMove, dropIndex, announceMove } from './sortable.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./sortable.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const src = read('js');

test('moveOrder relocates one item and copies otherwise; out-of-range or a no-op index changes nothing', () => {
    assert.deepEqual(moveOrder(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
    assert.deepEqual(moveOrder(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
    assert.deepEqual(moveOrder(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']);
    assert.deepEqual(moveOrder(['a', 'b', 'c'], -1, 1), ['a', 'b', 'c']);
    assert.deepEqual(moveOrder(['a', 'b', 'c'], 0, 9), ['a', 'b', 'c']);
    const order = ['a', 'b']; assert.notEqual(moveOrder(order, 0, 1), order, 'always a new array');
});

test('keyMove: Alt+Up and Alt+Down move by one and stop at the ends; any other key does nothing', () => {
    assert.equal(keyMove('ArrowUp', 2, 4), 1); assert.equal(keyMove('ArrowDown', 2, 4), 3);
    assert.equal(keyMove('ArrowUp', 0, 4), null); assert.equal(keyMove('ArrowDown', 3, 4), null);
    assert.equal(keyMove('ArrowLeft', 2, 4), null); assert.equal(keyMove('x', 2, 4), null);
});

test('dropIndex: the count of midpoints the pointer is past, so it sorts before the nearest one and after the last', () => {
    assert.equal(dropIndex([20, 60, 100], 0), 0);
    assert.equal(dropIndex([20, 60, 100], 21), 1);
    assert.equal(dropIndex([20, 60, 100], 59), 1);
    assert.equal(dropIndex([20, 60, 100], 61), 2);
    assert.equal(dropIndex([20, 60, 100], 200), 3);
    assert.equal(dropIndex([], 50), 0);
});

test('announceMove reports a 1-based position', () => {
    assert.equal(announceMove('Bake', 1, 4), 'Bake moved to position 2 of 4.');
});

// A stand-in for PkElement (as tests/commit-events.test.mjs uses): props are plain fields, emit() records events, part() returns a fake node.
function makeItem(value, top, opts = {}) {
    const attrs = {};
    return {
        localName: 'pk-sortable-item', value, disabled: false, tabIndex: -1, attrs,
        toggleAttribute(name, on) { attrs[name] = on || undefined; },
        setAttribute(name, v) { attrs[name] = v; },
        getBoundingClientRect: () => ({ top, bottom: top + 40, left: top, right: top + 40 }),
        focus() { this.focused = true; },
        ...opts,
    };
}
function make(items, props = {}) {
    const el = new (behaviour(class {
        emit(name, detail, init = {}) { this.events.push({ name, detail, cancelable: init.cancelable !== false }); return true; }
        part(n) { return (this.parts ??= {})[n] ??= { textContent: '' }; }
        aria() {}
        watchSlot() {}
        requestUpdate() {}
        addEventListener() {}
        warnOnce(key, message, detail) { this.warned.push({ key, message, detail }); }
    }))();
    Object.assign(el, { events: [], warned: [], label: '', orientation: 'vertical', disabled: false, acceptExternal: false, dragging: false, children: items, ...props });
    return el;
}

test('beginDrag captures the other rows\' midpoints; continueDrag marks the nearest neighbour; endDrag emits pk-reorder with the new order', () => {
    const items = [makeItem('a', 0), makeItem('b', 40), makeItem('c', 80)]; // mids 20, 60, 100
    const el = make(items);
    el.beginDrag(items[0], 10, 20);
    assert.equal(items[0].attrs.dragging, true); assert.equal(el.dragging, true);
    el.continueDrag(0, 90); // past b's mid (60), before c's mid (100): inserts before c, index 1
    assert.equal(items[2].attrs['drop-indicator'], 'before');
    el.endDrag(false);
    assert.equal(items[0].attrs.dragging, undefined, 'cleared on drop');
    assert.equal(items[2].attrs['drop-indicator'], 'none', 'cleared on drop');
    assert.equal(el.dragging, false);
    assert.deepEqual(el.events, [{ name: 'pk-reorder', detail: { order: ['b', 'a', 'c'], item: 'a', from: 0, to: 1, external: false }, cancelable: false }]);
});

test('a drag that ends where it started, or is cancelled, raises nothing', () => {
    const items = [makeItem('a', 0), makeItem('b', 40)];
    const el = make(items);
    el.beginDrag(items[0], 0, 0);
    el.continueDrag(0, 5); // still index 0
    el.endDrag(false);
    assert.equal(el.events.length, 0);
    const el2 = make(items);
    el2.beginDrag(items[0], 0, 0);
    el2.continueDrag(0, 999); // would move it
    el2.endDrag(true); // cancelled
    assert.equal(el2.events.length, 0);
});

test('beginDrag on a row not among this list\'s own children does nothing', () => {
    const items = [makeItem('a', 0)];
    const el = make(items);
    el.beginDrag(makeItem('x', 0), 0, 0);
    assert.equal(el.events.length, 0);
    assert.equal(el.dragging, false);
});

test('onKey: plain arrows move focus, Home and End jump to the ends', () => {
    const items = [makeItem('a', 0), makeItem('b', 40), makeItem('c', 80)];
    const el = make(items);
    const key = (k, alt = false) => { let prevented = false; el.onKey({ key: k, altKey: alt, target: { closest: () => items[1] }, preventDefault() { prevented = true; } }); return prevented; };
    assert.equal(key('ArrowDown'), true); assert.equal(items[2].focused, true);
    assert.equal(key('Home'), true); assert.equal(items[0].focused, true);
    assert.equal(key('x'), false);
});

test('onKey: a disabled row is skipped by plain arrows and cannot itself be moved', () => {
    const items = [makeItem('a', 0), makeItem('b', 40, { disabled: true }), makeItem('c', 80)];
    const el = make(items);
    el.onKey({ key: 'ArrowDown', target: { closest: () => items[0] }, preventDefault() {} });
    assert.equal(items[2].focused, true, 'ArrowDown from a skips disabled b and lands on c');
    const el2 = make(items);
    el2.onKey({ key: 'ArrowDown', altKey: true, target: { closest: () => items[1] }, preventDefault() {} });
    assert.equal(el2.events.length, 0, 'a key dispatched on a disabled row (a script focusing it directly) does not reorder it');
});

test('onKey: Alt+Up and Alt+Down reorder the focused row and announce it, without touching any DOM', () => {
    const items = [makeItem('a', 0), makeItem('b', 40), makeItem('c', 80)];
    const el = make(items);
    el.onKey({ key: 'ArrowDown', altKey: true, target: { closest: () => items[0] }, preventDefault() {} });
    assert.deepEqual(el.events, [{ name: 'pk-reorder', detail: { order: ['b', 'a', 'c'], item: 'a', from: 0, to: 1, external: false }, cancelable: false }]);
    assert.equal(el.part('announcer').textContent, 'a moved to position 2 of 3.', 'the reorder is announced in the live region');
    el.say('x'); assert.equal(el.part('announcer').textContent, 'x');
});

test('a disabled list, or a key on a row it does not own, does nothing', () => {
    const items = [makeItem('a', 0), makeItem('b', 40)];
    const el = make(items, { disabled: true });
    el.onKey({ key: 'ArrowDown', altKey: true, target: { closest: () => items[0] }, preventDefault() {} });
    assert.equal(el.events.length, 0);
    const el2 = make(items);
    el2.onKey({ key: 'ArrowDown', target: { closest: () => null }, preventDefault() {} });
    assert.equal(el2.events.length, 0);
});

test('external drag: beginExternalDrag then externalDragOver then endExternalDrag(true) inserts at the hovered index and carries the payload', () => {
    const items = [makeItem('a', 0), makeItem('b', 40)]; // mids 20, 60
    const el = make(items, { acceptExternal: true });
    el.beginExternalDrag({ tag: 'pk-button' });
    assert.equal(el.externalDragOver(0, 30), true); // past a's mid: index 1
    assert.equal(items[1].attrs['drop-indicator'], 'before');
    const index = el.endExternalDrag(true);
    assert.equal(index, 1);
    assert.deepEqual(el.events, [{ name: 'pk-reorder', detail: { order: null, item: null, from: null, to: 1, external: true, payload: { tag: 'pk-button' } }, cancelable: false }]);
    assert.equal(items[1].attrs['drop-indicator'], 'none', 'cleared after the drop');
});

test('external drag: without accept-external the drop is refused and logged; a cancelled drop raises nothing', () => {
    const items = [makeItem('a', 0)];
    const el = make(items); // acceptExternal is false
    el.beginExternalDrag('x');
    assert.equal(el.externalDragOver(0, 0), false);
    assert.equal(el.endExternalDrag(true), null);
    assert.ok(el.warned.some(w => w.key === 'external-accept'));
    const el2 = make(items, { acceptExternal: true });
    el2.beginExternalDrag('x');
    el2.externalDragOver(0, 0);
    assert.equal(el2.endExternalDrag(false), null);
    assert.equal(el2.events.length, 0);
    const el3 = make(items, { disabled: true });
    el3.beginExternalDrag('x');
    assert.equal(el3.$ext, undefined);
    assert.ok(el3.warned.some(w => w.key === 'external-disabled'));
});

test('updated keeps exactly one row in the tab order: the current one, or the first enabled row', () => {
    const items = [makeItem('a', 0), makeItem('b', 40), makeItem('c', 80)];
    items[1].tabIndex = 0;
    const el = make(items);
    el.updated();
    assert.deepEqual(items.map(i => i.tabIndex), [-1, 0, -1]);
});

test('the meta declares pk-reorder, the writes to pk-sortable-item children, and role=list in the a11y notes', () => {
    assert.ok(meta.events.some(e => e.name === 'pk-reorder' && e.detailProps.to === 'number'));
    assert.deepEqual(meta.slots.map(s => s.name), ['']);
    const writes = meta.writes[0];
    assert.deepEqual(writes.attributes.sort(), ['dragging', 'drop-indicator', 'tabindex']);
    assert.match(meta.a11y, /role=list\b/);
    assert.ok(meta.methods.some(m => m.name.startsWith('beginExternalDrag')));
});

test('the css uses tokens only, a 44px touch handle comes from sortable-item, and the announcer is visually hidden', () => {
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
    assert.ok(css.includes('[part="announcer"]') && css.includes('clip-path'));
    const tokens = fs.readFileSync(fileURLToPath(new URL('../../tokens/tokens.css', import.meta.url)), 'utf8');
    for (const [, tok] of css.matchAll(/var\((--(?:space|color|touch)[\w-]*)\)/g)) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
});

test('the source never reorders, adds or removes a light-DOM child, and holds no listener on document or window', () => {
    assert.ok(!/\.(appendChild|insertBefore|removeChild|replaceChildren|append|prepend|remove)\(/.test(src), 'no DOM structure change');
    assert.ok(!/\b(document|window)\s*\.\s*addEventListener/.test(src));
});
