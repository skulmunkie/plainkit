// Unit tests for pk-tag: the remove button, its event and its accessible name. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './tag.js';

const make = (props = {}, allow = true) => {
    const emitted = []; const attrs = {}; let removed = 0;
    const button = { listeners: [], addEventListener(t, fn) { this.listeners.push(fn); }, setAttribute: (n, v) => { attrs[n] = v; } };
    const el = new (behaviour(class { part() { return button; } emit(n, d) { emitted.push([n, d]); return allow; } remove() { removed++; } }))();
    Object.assign(el, { value: '', disabled: false, controlled: false, textContent: ' Green ' }, props);
    return { el, button, emitted, attrs, removed: () => removed };
};

test('pressing remove raises pk-remove with the value, falling back to the trimmed text, and removes the tag', () => {
    const a = make({ value: 'g1' }); a.el.connected(); a.button.listeners[0]();
    assert.deepEqual(a.emitted, [['pk-remove', { value: 'g1' }]]); assert.equal(a.removed(), 1);
    const b = make(); b.el.connected(); b.button.listeners[0]();
    assert.deepEqual(b.emitted, [['pk-remove', { value: 'Green' }]]);
});

test('a cancelled pk-remove keeps the tag', () => {
    const { el, button, removed } = make({}, false);
    el.connected(); button.listeners[0]();
    assert.equal(removed(), 0);
});

test('a controlled tag only raises the event; the host removes it', () => {
    const { el, button, emitted, removed } = make({ controlled: true });
    el.connected(); button.listeners[0]();
    assert.equal(emitted.length, 1); assert.equal(removed(), 0);
});

test('a disabled tag raises nothing', () => {
    const { el, button, emitted, removed } = make({ disabled: true });
    el.connected(); button.listeners[0]();
    assert.deepEqual(emitted, []); assert.equal(removed(), 0);
});

test('the button is named after the value or the text', () => {
    const a = make({ value: 'g1' }); a.el.updated(); assert.equal(a.attrs['aria-label'], 'Remove g1');
    const b = make(); b.el.updated(); assert.equal(b.attrs['aria-label'], 'Remove Green');
});

test('connecting twice adds one listener', () => {
    const { el, button } = make();
    el.connected(); el.connected();
    assert.equal(button.listeners.length, 1);
});
