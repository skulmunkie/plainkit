// Unit tests for pk-property-grid: building groups and controls, values in and out, built-in and host validation, the change event. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './property-grid.js';

const fakeEl = tag => ({
    localName: tag, children: [], listeners: {}, hidden: false, disabled: false,
    append(...k) { this.children.push(...k); },
    replaceChildren(...k) { this.children = k; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    fire(type, e) { for (const fn of this.listeners[type] ?? []) fn(e); },
});

const make = config => {
    const parts = { empty: fakeEl('p'), groups: fakeEl('pk-accordion') };
    const emitted = [];
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return { querySelectorAll: () => [], matches: () => false }; }
        emit(name, detail) { emitted.push({ name, detail }); }
    }))();
    el.config = config;
    el.values = {};
    el.errors = {};
    return { el, parts, emitted };
};

const CONFIG = { groups: [
    { heading: 'Dimensions', fields: [{ key: 'width', type: 'number', label: 'Width', min: 1, max: 100, required: true }] },
    { heading: 'Output', collapsed: true, fields: [{ key: 'format', type: 'select', label: 'Format', options: ['PNG', { value: 'jpg', label: 'JPEG' }] }, { key: 'alpha', type: 'switch', label: 'Alpha' }, { key: 'note', type: 'text', label: 'Note', disabled: true }] },
] };

test('builds one accordion item per group with a labelled control per field; collapsed groups start closed', () => {
    const { el, parts } = make(CONFIG);
    el.connected();
    const [dims, out] = parts.groups.children;
    assert.equal(dims.heading, 'Dimensions'); assert.equal(dims.open, true);
    assert.equal(out.open, false);
    const [width] = dims.children[0].children;
    assert.equal(width.localName, 'pk-input'); assert.equal(width.type, 'number'); assert.equal(width.label, 'Width'); assert.equal(width.showLabel, true); assert.equal(width.min, 1);
    const [field, alpha, note] = out.children[0].children.filter(c => c.localName !== 'pk-alert');
    assert.equal(field.localName, 'pk-field'); assert.equal(field.label, 'Format');
    const format = field.children[0];
    assert.equal(format.localName, 'pk-select'); assert.equal(format.children.length, 2);
    assert.equal(alpha.localName, 'pk-switch'); assert.equal(alpha.textContent, 'Alpha');
    assert.equal(note.disabled, true);
});

test('an empty config shows the placeholder; connected is idempotent and an unchanged config does not rebuild', () => {
    const { el, parts } = make({});
    el.connected();
    assert.equal(parts.empty.hidden, false);
    el.config = CONFIG;
    el.changed('config');
    assert.equal(parts.empty.hidden, true);
    const before = parts.groups.children;
    el.connected(); el.build();
    assert.equal(parts.groups.children, before);
});

test('values are written into the controls and read back by key', () => {
    const { el } = make(CONFIG);
    el.values = { width: 40, format: 'jpg', alpha: true };
    el.connected();
    const v = el.currentValues();
    assert.deepEqual([v.width, v.format, v.alpha], [40, 'jpg', true]);
});

test('built-in validation: required, number range; host errors win and mark the control invalid with a visible message', () => {
    const { el } = make(CONFIG);
    el.values = { width: 0 };
    el.connected();
    assert.equal(el.$rows.width.c.invalid, true);
    assert.match(el.$rows.width.msg.textContent, /at least 1/);
    assert.equal(el.$rows.width.msg.hidden, false);
    assert.equal(el.valid, false);
    el.$rows.width.c.value = '50'; el.paint();
    assert.equal(el.valid, true); assert.equal(el.$rows.width.msg.hidden, true);
    el.errors = { width: 'Taken' }; el.changed('errors');
    assert.equal(el.$rows.width.msg.textContent, 'Taken'); assert.equal(el.$rows.width.c.invalid, true);
    el.$rows.width.c.value = ''; el.errors = {}; el.paint();
    assert.match(el.$rows.width.msg.textContent, /required/);
});

test('a committed change emits pk-property-change with key, value, all values and validity; foreign targets are ignored', () => {
    const { el, parts, emitted } = make(CONFIG);
    el.values = { width: 10 };
    el.connected();
    el.$rows.width.c.value = '500';
    parts.groups.fire('pk-value-change', { target: el.$rows.width.c });
    parts.groups.fire('pk-value-change', { target: {} });
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].name, 'pk-property-change');
    assert.equal(emitted[0].detail.key, 'width'); assert.equal(emitted[0].detail.value, 500);
    assert.equal(emitted[0].detail.valid, false);
    assert.equal(emitted[0].detail.values.width, 500);
});

test('disabled disables every control except it keeps a field-level disabled', () => {
    const { el } = make(CONFIG);
    el.connected();
    el.disabled = true; el.changed('disabled');
    assert.equal(el.$rows.width.c.disabled, true);
    el.disabled = false; el.changed('disabled');
    assert.equal(el.$rows.width.c.disabled, false);
    assert.equal(el.$rows.note.c.disabled, true);
});
