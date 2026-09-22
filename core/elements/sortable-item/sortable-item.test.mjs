// pk-sortable-item: the handle's pointer capture and event relay on a stub base, and the meta, css and source held to the standards.
// Real pointer capture and the 44px handle are checked in the browser suite (core/tests/browser/cases-layout.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour from './sortable-item.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./sortable-item.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const src = read('js');

// A stand-in for PkElement, as tests/commit-events.test.mjs uses: props are plain fields, emit() records the event, part() returns a fake handle.
const make = (props = {}) => {
    const el = new (behaviour(class { emit(name, detail, init = {}) { this.events.push({ name, detail, cancelable: init.cancelable !== false }); return true; } aria(m) { this.ariaCalls.push(m); } }))();
    const handle = { listeners: {}, disabled: false, addEventListener(t, f) { this.listeners[t] = f; }, setPointerCapture() { this.captured = true; }, releasePointerCapture() { this.captured = false; }, hasPointerCapture: id => handle.captured && handle.$id === id, setAttribute(n, v) { this.attrs ??= {}; this.attrs[n] = v; } };
    Object.assign(el, { events: [], ariaCalls: [], value: '', disabled: false, ...props });
    el.part = () => handle;
    el.connected();
    return { el, handle };
};

test('a pointer grab captures the handle and raises pk-sortable-grab with the point', () => {
    const { el, handle } = make();
    handle.listeners.pointerdown({ pointerId: 3, button: 0, clientX: 10, clientY: 20 });
    assert.equal(handle.captured, true);
    assert.deepEqual(el.events, [{ name: 'pk-sortable-grab', detail: { x: 10, y: 20 }, cancelable: false }]);
});

test('a move before any grab, or the wrong pointer, raises nothing; a move that owns the pointer raises pk-sortable-drag', () => {
    const { el, handle } = make();
    handle.listeners.pointermove({ pointerId: 1, clientX: 1, clientY: 1 });
    assert.equal(el.events.length, 0);
    handle.listeners.pointerdown({ pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    handle.$id = 1; handle.captured = true;
    handle.listeners.pointermove({ pointerId: 2, clientX: 1, clientY: 1 });
    assert.equal(el.events.length, 1, 'a different pointer id is ignored');
    handle.listeners.pointermove({ pointerId: 1, clientX: 5, clientY: 6 });
    assert.deepEqual(el.events[1], { name: 'pk-sortable-drag', detail: { x: 5, y: 6 }, cancelable: false });
});

test('a drop releases capture and raises pk-sortable-drop, cancelled only for pointercancel', () => {
    const { el, handle } = make();
    handle.listeners.pointerdown({ pointerId: 4, button: 0, clientX: 0, clientY: 0 });
    handle.$id = 4;
    handle.listeners.pointerup({ pointerId: 4, type: 'pointerup' });
    assert.equal(handle.captured, false);
    assert.deepEqual(el.events.at(-1), { name: 'pk-sortable-drop', detail: { cancelled: false }, cancelable: false });
    const two = make();
    two.handle.listeners.pointerdown({ pointerId: 5, button: 0, clientX: 0, clientY: 0 });
    two.handle.listeners.pointercancel({ pointerId: 5, type: 'pointercancel' });
    assert.deepEqual(two.el.events.at(-1), { name: 'pk-sortable-drop', detail: { cancelled: true }, cancelable: false });
});

test('a disabled item, or a secondary button, does not grab', () => {
    const { el, handle } = make({ disabled: true });
    handle.listeners.pointerdown({ pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    assert.equal(el.events.length, 0);
    const { el: el2, handle: h2 } = make();
    h2.listeners.pointerdown({ pointerId: 1, button: 2, clientX: 0, clientY: 0 });
    assert.equal(el2.events.length, 0);
});

test('updated sets role=listitem, aria-roledescription and the handle label from value', () => {
    const { el, handle } = make({ value: 'bake' });
    el.updated();
    assert.deepEqual(el.ariaCalls.at(-1), { role: 'listitem', ariaRoleDescription: 'Draggable item', ariaDisabled: null });
    assert.equal(handle.attrs['aria-label'], 'Drag bake to reorder');
});

test('the meta documents value as the row\'s identifier and the three coordination events', () => {
    const prop = name => meta.props.find(p => p.name === name);
    assert.equal(prop('value').type, 'string');
    assert.deepEqual(meta.events.map(e => e.name).sort(), ['pk-sortable-drag', 'pk-sortable-drop', 'pk-sortable-grab']);
    assert.match(meta.a11y, /aria-hidden/);
});

test('the css uses tokens only and the handle grows to the 44px touch target on a coarse pointer or a phone', () => {
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
    assert.ok(css.includes('@media (pointer: coarse), (--phone)') && css.includes('var(--touch-target)'));
    const tokens = fs.readFileSync(fileURLToPath(new URL('../../tokens/tokens.css', import.meta.url)), 'utf8');
    for (const [, tok] of css.matchAll(/var\((--(?:space|color|touch)[\w-]*)\)/g)) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
});

test('the source keeps every listener on the handle (nothing on document or window to clean up) and releases pointer capture', () => {
    assert.ok(!/\b(document|window|ownerDocument)\s*\.\s*addEventListener/.test(src));
    assert.ok(src.includes('setPointerCapture') && src.includes('releasePointerCapture'));
});
