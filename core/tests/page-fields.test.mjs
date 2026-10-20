// js/page-fields.js: the controls tool-page and settings-page build from a config field. A select with `styled` (or a combobox with `mode`) goes through
// resolveSpec like pk-field-group's, so the page and the group agree on the control (#1646).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildField, read, write } from '../js/page-fields.js';

const doc = {
    createElement: localName => ({
        localName, attrs: {}, kids: [],
        setAttribute(k, v) { this.attrs[k] = String(v); },
        append(...k) { this.kids.push(...k); },
    }),
};
const options = [{ value: 'a', label: 'Alpha' }, 'b'];

test('a select field is the native pk-select with its options', () => {
    const { el, row } = buildField(doc, { key: 's', type: 'select', label: 'Pick', options });
    assert.equal(el.localName, 'pk-select');
    assert.equal(row, el);
    assert.deepEqual(el.kids.map(o => [o.value, o.textContent]), [['a', 'Alpha'], ['b', 'b']]);
});

test('a select field with styled is the combobox in select mode, with the same options, label and required', () => {
    const { el } = buildField(doc, { key: 's', type: 'select', styled: true, label: 'Pick', required: true, options });
    assert.equal(el.localName, 'pk-combobox');
    assert.equal(el.attrs.mode, 'select');
    assert.equal(el.label, 'Pick');
    assert.equal(el.required, true);
    assert.deepEqual(el.kids.map(o => [o.localName, o.value, o.textContent]), [['option', 'a', 'Alpha'], ['option', 'b', 'b']]);
    write(el, 'select', 'b');
    assert.equal(read(el, 'select'), 'b');
});

test('a combobox field takes its mode, and without one stays the autocomplete combobox', () => {
    assert.equal(buildField(doc, { key: 'c', type: 'combobox', mode: 'select', options }).el.attrs.mode, 'select');
    const plain = buildField(doc, { key: 'c', type: 'combobox', options }).el;
    assert.equal(plain.localName, 'pk-combobox');
    assert.equal(plain.attrs.mode, undefined);
});

test('styled changes only a select: a text field keeps pk-input', () => {
    assert.equal(buildField(doc, { key: 't', type: 'text', styled: true }).el.localName, 'pk-input');
});
