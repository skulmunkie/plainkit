// js/field-kinds.js: the table of what a field spec becomes, and the rules of a conditional field (pk-field-group, js/page-fields.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { controlTag, isChecked, commitOf, controlAttrs, messageAttrs, isVisible, writeValue, readValue, formEntries, valuesFromEntries } from '../js/field-kinds.js';

test('every scalar kind is a pk-input; the others pick their own control', () => {
    for (const k of ['text', 'number', 'email', 'password', 'date', 'time', 'url', 'tel', 'unknown', undefined]) assert.equal(controlTag(k), 'pk-input');
    assert.deepEqual(['textarea', 'select', 'checkbox', 'switch', 'range', 'combobox'].map(controlTag), ['pk-textarea', 'pk-select', 'pk-checkbox', 'pk-switch', 'pk-range', 'pk-combobox']);
    assert.ok(isChecked('checkbox') && isChecked('switch') && !isChecked('text'));
});

test('each control commits through its own documented event, and the value is read from it', () => {
    assert.equal(commitOf('text').event, 'pk-value-change');
    assert.equal(commitOf('text').read({ detail: { value: 'x' } }), 'x');
    assert.equal(commitOf('switch').event, 'pk-change');
    assert.equal(commitOf('checkbox').read({ detail: { checked: 1 } }), true);
    assert.equal(commitOf('range').read({ detail: { value: 4 } }), 4);
    assert.equal(commitOf('combobox').read({ target: { value: 'z' } }), 'z');
});

test('a spec becomes the attributes of its control: only the set ones, the type of a scalar, constraints', () => {
    assert.deepEqual(controlAttrs({ key: 'q', kind: 'number', min: '1', max: 9, step: '0.5', required: true }), { type: 'number', required: '', min: '1', max: 9, step: '0.5' });
    assert.deepEqual(controlAttrs({ key: 'q', kind: 'wat', placeholder: 'p' }), { type: 'text', placeholder: 'p' }, 'an unknown kind is text');
    assert.deepEqual(controlAttrs({ key: 'n', kind: 'textarea', rows: 5, maxlength: 40 }), { maxlength: 40, rows: 5 });
    assert.deepEqual(controlAttrs({ key: 'r', kind: 'range', min: 0, max: 10, required: true }), { min: 0, max: 10 }, 'a range has no required');
    assert.deepEqual(controlAttrs({ key: 's', kind: 'select', required: true }), { required: '' });
    assert.deepEqual(controlAttrs({ key: 'c', kind: 'combobox', free: true, placeholder: 'x' }), { placeholder: 'x', free: '' });
    assert.deepEqual(messageAttrs({ msg: { required: 'Enter a name.' } }), { 'data-msg-required': 'Enter a name.' });
    assert.deepEqual(messageAttrs({}), {});
});

test('when: equals, in and not compare as text; a missing field is empty; the callback is asked last', () => {
    const v = { status: 'closed', n: 3 };
    assert.equal(isVisible({}, v), true);
    assert.equal(isVisible({ when: { field: 'status', equals: 'closed' } }, v), true);
    assert.equal(isVisible({ when: { field: 'status', equals: 'open' } }, v), false);
    assert.equal(isVisible({ when: { field: 'n', equals: '3' } }, v), true, 'a number equals its text');
    assert.equal(isVisible({ when: { field: 'status', in: ['open', 'closed'] } }, v), true);
    assert.equal(isVisible({ when: { field: 'status', in: ['open'] } }, v), false);
    assert.equal(isVisible({ when: { field: 'status', not: 'closed' } }, v), false);
    assert.equal(isVisible({ when: { field: 'gone', equals: '' } }, v), true, 'a missing value is the empty text');
    assert.equal(isVisible({ when: { field: 'status', equals: 'closed' } }, v, () => false), false, 'the callback can still hide it');
    assert.equal(isVisible({}, v, (spec, values) => values.status === 'closed'), true);
});

test('form entries: one per shown, enabled field; a checkbox or switch only when checked; a list one entry per item; a prefix names the group', () => {
    const rows = [
        { key: 'a', kind: 'text', value: 'x' }, { key: 'b', kind: 'text', value: undefined }, { key: 'c', kind: 'checkbox', value: true }, { key: 'd', kind: 'switch', value: false },
        { key: 'e', kind: 'text', value: 'no', disabled: true }, { key: 'f', kind: 'range', value: 4 }, { key: 'g', kind: 'text', value: ['p', 'q'] },
    ];
    assert.deepEqual(formEntries(rows), [['a', 'x'], ['b', ''], ['c', 'on'], ['f', '4'], ['g', 'p'], ['g', 'q']]);
    assert.deepEqual(formEntries([{ key: 'a', kind: 'text', value: 'x' }], 'order'), [['order.a', 'x']]);
});

test('saved entries come back as values: the prefix is stripped, a repeated key becomes a list, other groups are ignored', () => {
    assert.deepEqual(valuesFromEntries([['a', '1'], ['b', 'x'], ['b', 'y']]), { a: '1', b: ['x', 'y'] });
    assert.deepEqual(valuesFromEntries([['o.a', '1'], ['other.a', '2']], 'o'), { a: '1' });
});

test('read and write: a switch or checkbox holds a boolean, the others text; "false" and empty uncheck', () => {
    const box = {}; writeValue(box, 'checkbox', 'true'); assert.equal(readValue(box, 'checkbox'), true);
    writeValue(box, 'switch', 'false'); assert.equal(box.checked, false);
    writeValue(box, 'switch', undefined); assert.equal(box.checked, false);
    const input = {}; writeValue(input, 'text', undefined); assert.equal(readValue(input, 'text'), '');
    writeValue(input, 'text', 5); assert.equal(input.value, 5);
});
