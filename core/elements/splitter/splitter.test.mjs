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
    const handle = { listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, getBoundingClientRect: () => ({ left: 346, top: 0, width: 8, height: 100 }), setPointerCapture() {}, hasPointerCapture: () => false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute() {} };
    const root = { toggleAttribute() {}, addEventListener() {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute() {}, getBoundingClientRect: () => ({ left: 100, top: 0, width: 500, height: 100 }), style: { setProperty() {} } };
    Object.assign(el, { events: [], parts: null, size: 50, min: 10, max: 90, step: 2, orientation: 'horizontal', disabled: false, children: [], ownerDocument: { activeElement: null, defaultView: { getComputedStyle: () => ({ direction: 'ltr' }) } }, dispatchEvent() {} }, props);
    const toggle = { listeners: {}, focused: 0, addEventListener(t, f) { this.listeners[t] = f; }, focus() { this.focused++; }, setAttribute(k, v) { this[k] = v; } };
    const end = { inert: false };
    el.part = n => (n === 'handle' ? handle : n === 'toggle' ? toggle : n === 'end' ? end : root);
    el.connected();
    return { el, handle, toggle, end };
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

test('collapsible: the toggle, Enter, Space and a double click collapse the end pane, keep size and raise pk-collapse-change once, not cancelable', () => {
    const { el, handle, toggle } = make({ collapsible: true });
    toggle.listeners.click();
    assert.equal(el.collapsed, true); assert.equal(el.size, 50, 'size is never overwritten');
    assert.deepEqual(el.events, [{ name: 'pk-collapse-change', detail: { collapsed: true }, cancelable: false }]);
    let prevented = 0;
    handle.listeners.keydown({ key: 'Enter', preventDefault() { prevented++; } }); assert.equal(el.collapsed, false);
    handle.listeners.keydown({ key: ' ', preventDefault() { prevented++; } }); assert.equal(el.collapsed, true);
    assert.equal(prevented, 2);
    handle.listeners.dblclick(); assert.equal(el.collapsed, false);
    assert.deepEqual(el.events.map(e => e.detail.collapsed), [true, false, true, false]);
});

test('collapsed: arrows and drags do nothing, aria-valuenow is 0 and the end pane is inert; the host setting it raises nothing', () => {
    const { el, handle, toggle, end } = make({ collapsible: true });
    el.collapsed = true; el.updated();
    assert.equal(end.inert, true); assert.equal(handle.attrs['aria-valuenow'], '0'); assert.equal(toggle.hidden, false); assert.equal(toggle['aria-expanded'], 'false'); assert.equal(toggle['aria-label'], 'Expand panel');
    assert.equal(el.events.length, 0);
    handle.listeners.keydown({ key: 'ArrowRight', preventDefault() { throw new Error('must not handle'); } });
    handle.listeners.pointerdown({ button: 0, pointerId: 1, clientX: 350, clientY: 0 });
    assert.equal(el.$drag, undefined); assert.equal(el.size, 50); assert.equal(el.events.length, 0);
    el.collapsed = false; el.toggleLabel = 'Toggle inspector'; el.updated();
    assert.equal(end.inert, false); assert.equal(toggle['aria-expanded'], 'true'); assert.equal(toggle['aria-label'], 'Toggle inspector');
});

test('not collapsible: no toggle, Enter does nothing, and a collapsed attribute is ignored; disabled blocks the toggle', () => {
    const { el, handle, toggle, end } = make({ collapsed: true });
    el.updated();
    assert.equal(toggle.hidden, true); assert.equal(end.inert, false, 'collapsed needs collapsible');
    handle.listeners.keydown({ key: 'Enter', preventDefault() { throw new Error('must not handle'); } }); handle.listeners.dblclick();
    assert.equal(el.events.length, 0);
    const off = make({ collapsible: true, disabled: true });
    off.toggle.listeners.click(); assert.equal(off.el.collapsed, undefined); assert.equal(off.el.events.length, 0);
});

test('collapsing while focus is inside the end pane moves focus to the toggle', () => {
    const inner = { }; const pane = { getAttribute: () => 'end', contains: n => n === inner };
    const { el, toggle } = make({ collapsible: true, children: [pane] });
    el.ownerDocument.activeElement = inner;
    toggle.listeners.click();
    assert.equal(toggle.focused, 1);
    el.ownerDocument.activeElement = null; toggle.listeners.click(); assert.equal(toggle.focused, 1, 'expanding moves nothing');
});

test('the meta declares collapsible, collapsed (committed by pk-collapse-change), toggleLabel, the event and the toggle part', () => {
    assert.equal(prop('collapsible').type, 'boolean'); assert.equal(prop('collapsed').commit, 'pk-collapse-change');
    assert.equal(prop('toggleLabel').default, '');
    assert.ok(meta.events.some(e => e.name === 'pk-collapse-change' && e.detailProps.collapsed === 'boolean'));
    assert.ok(meta.parts.some(p => p.name === 'toggle'));
    assert.ok(meta.examples.some(x => x.html.includes('collapsible')));
});
