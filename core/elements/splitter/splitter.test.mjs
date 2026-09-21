// pk-splitter: the pure size rules, the keyboard and pointer behaviour on a stub base, and the meta, css and source held to the standards.
// The computed layout, real pointer capture and the 44px hit area are checked in the browser suite (tests/browser/cases-layout.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { clampSize, keySize, pointerSize } from './splitter.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./splitter.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const src = read('js');
const prop = name => meta.props.find(p => p.name === name);

test('clampSize holds a size to the range in either order, to one decimal, and treats junk as the middle', () => {
    assert.equal(clampSize(50, 10, 90), 50);
    assert.equal(clampSize(3, 10, 90), 10);
    assert.equal(clampSize(99, 10, 90), 90);
    assert.equal(clampSize(33.333, 10, 90), 33.3);
    assert.equal(clampSize(50, 90, 10), 50);
    assert.equal(clampSize(NaN, 10, 90), 50);
});

test('keySize: arrows along the axis, mirrored in rtl, Home and End, and nothing for other keys', () => {
    const o = { min: 10, max: 90, step: 2, horizontal: true };
    assert.equal(keySize('ArrowRight', 50, o), 52); assert.equal(keySize('ArrowLeft', 50, o), 48);
    assert.equal(keySize('ArrowRight', 50, { ...o, rtl: true }), 48); assert.equal(keySize('ArrowLeft', 50, { ...o, rtl: true }), 52);
    assert.equal(keySize('ArrowDown', 50, o), null); assert.equal(keySize('a', 50, o), null);
    const v = { ...o, horizontal: false };
    assert.equal(keySize('ArrowDown', 50, v), 52); assert.equal(keySize('ArrowUp', 50, v), 48); assert.equal(keySize('ArrowRight', 50, v), null);
    assert.equal(keySize('Home', 50, o), 10); assert.equal(keySize('End', 50, o), 90);
    assert.equal(keySize('ArrowRight', 50, { ...o, step: 0 }), 51, 'a bad step is 1');
});

test('pointerSize turns a pointer position into a percentage, keeping the grab offset and mirroring in rtl', () => {
    // A box from x=100, 500 long, with an 8 thick handle: the start pane is 492 * size / 100 long.
    assert.equal(pointerSize(100 + 246 + 4, 0, 100, 500, 8), 50);
    assert.equal(pointerSize(100 + 4, 0, 100, 500, 8), 0);
    assert.equal(pointerSize(100 + 492 + 4, 0, 100, 500, 8), 100);
    assert.equal(pointerSize(100 + 246 + 4 + 5, 5, 100, 500, 8), 50, 'the pointer offset at grab time does not make the handle jump');
    assert.equal(pointerSize(600 - 246 - 4, 0, 100, 500, 8, true), 50);
    assert.equal(pointerSize(600 - 4, 0, 100, 500, 8, true), 0);
});

// A stand-in for PkElement, as tests/commit-events.test.mjs uses: props are plain fields, emit() records the event.
const make = (props = {}) => {
    const el = new (behaviour(class { emit(name, detail, init = {}) { this.events.push({ name, detail, cancelable: init.cancelable !== false }); return true; } part() { return this.parts; } }))();
    const handle = { listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, getBoundingClientRect: () => ({ left: 346, top: 0, width: 8, height: 100 }), setPointerCapture() {}, hasPointerCapture: () => false };
    const root = { toggleAttribute() {}, getBoundingClientRect: () => ({ left: 100, top: 0, width: 500, height: 100 }), style: { setProperty() {} } };
    Object.assign(el, { events: [], parts: null, size: 50, min: 10, max: 90, step: 2, orientation: 'horizontal', disabled: false, ownerDocument: { defaultView: { getComputedStyle: () => ({ direction: 'ltr' }) } }, dispatchEvent() {} }, props);
    el.part = n => (n === 'handle' ? handle : root);
    el.connected();
    return { el, handle };
};

test('a key press moves the size and raises pk-resize once with the new size, not cancelable', () => {
    const { el, handle } = make();
    const key = k => { let prevented = false; handle.listeners.keydown({ key: k, preventDefault() { prevented = true; } }); return prevented; };
    assert.equal(key('ArrowRight'), true);
    assert.equal(el.size, 52);
    assert.deepEqual(el.events, [{ name: 'pk-resize', detail: { size: 52 }, cancelable: false }]);
    assert.equal(key('x'), false); assert.equal(el.events.length, 1);
    key('End'); key('End'); // the second one is already at the end: nothing to say
    assert.equal(el.size, 90); assert.equal(el.events.length, 2);
});

test('a size the host sets raises nothing, and a disabled splitter ignores keys and pointers', () => {
    const { el, handle } = make();
    el.size = 70;
    assert.equal(el.events.length, 0);
    const off = make({ disabled: true });
    off.handle.listeners.keydown({ key: 'ArrowRight', preventDefault() {} });
    off.handle.listeners.pointerdown({ button: 0, pointerId: 1, clientX: 350, clientY: 0 });
    assert.equal(off.el.size, 50); assert.equal(off.el.events.length, 0); assert.equal(off.el.$drag, undefined);
});

test('a drag raises input while moving and one pk-resize when it ends; a click without movement raises none', () => {
    const { el, handle } = make();
    el.dispatchEvent = e => el.events.push({ name: e.type });
    handle.listeners.pointerdown({ button: 0, pointerId: 1, clientX: 350, clientY: 0 }); // the handle's centre
    handle.listeners.pointermove({ clientX: 350 + 49.2, clientY: 0 }); // 10 percent more
    assert.equal(el.size, 60);
    handle.listeners.pointermove({ clientX: 5000, clientY: 0 });
    assert.equal(el.size, 90, 'held to max');
    assert.deepEqual(el.events.map(e => e.name), ['input', 'input']);
    handle.listeners.pointerup(); handle.listeners.lostpointercapture(); // the browser raises both
    assert.deepEqual(el.events.at(-1), { name: 'pk-resize', detail: { size: 90 }, cancelable: false });
    assert.equal(el.events.filter(e => e.name === 'pk-resize').length, 1);
    const click = make();
    click.handle.listeners.pointerdown({ button: 0, pointerId: 1, clientX: 350, clientY: 0 }); click.handle.listeners.pointerup();
    assert.equal(click.el.events.length, 0);
});

test('the meta names its commit event and documents the panes, the separator and the events', () => {
    assert.equal(prop('size').commit, 'pk-resize');
    assert.ok(meta.events.some(e => e.name === 'pk-resize' && e.detailProps.size === 'number'));
    assert.deepEqual(meta.slots.map(s => s.name), ['start', 'end']);
    for (const p of ['min', 'max', 'size', 'step']) assert.equal(prop(p).type, 'number');
    assert.equal(prop('orientation').default, 'horizontal');
    assert.match(meta.a11y, /role=separator/); assert.match(meta.a11y, /aria-valuenow/);
});

test('the css uses tokens only, logical properties, a 44px touch hit area and reduced motion', () => {
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
    assert.ok(!/\b(margin|padding|border)-(left|right|top|bottom)\b|\b(width|height)\s*:/.test(css), 'physical properties');
    assert.ok(css.includes('@media (pointer: coarse)') && css.includes('var(--touch-target)'), 'a coarse pointer gets the 44px hit area from the token');
    assert.ok(css.includes('touch-action: none'));
    assert.ok(css.includes(':host([hidden])') && css.includes('prefers-reduced-motion'));
    const tokens = fs.readFileSync(fileURLToPath(new URL('../../tokens/tokens.css', import.meta.url)), 'utf8');
    for (const [, tok] of css.matchAll(/var\((--(?:space|color|touch)[\w-]*)\)/g)) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
});

test('the source keeps every listener on the handle (nothing on document or window to clean up) and releases pointer capture', () => {
    assert.ok(!/\b(document|window|ownerDocument)\s*\.\s*addEventListener|setInterval|setTimeout|Observer\(/.test(src));
    assert.ok(src.includes('setPointerCapture') && src.includes('releasePointerCapture') && src.includes("'pointercancel'") && src.includes("'lostpointercapture'"));
});
