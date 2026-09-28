import test from 'node:test';
import assert from 'node:assert/strict';
import { flagsOf, selectedValues, buildOption, buildOptions } from './select.js';

test('selectedValues returns the values of the selected options in order', () => {
    assert.deepEqual(selectedValues([{ value: 'a', selected: true }, { value: 'b', selected: false }, { value: 'c', selected: true }]), ['a', 'c']);
    assert.deepEqual(selectedValues([]), []);
});
test('flagsOf copies every ValidityState-like flag', () => {
    const f = flagsOf({ valueMissing: true, tooLong: false });
    assert.equal(f.valueMissing, true);
    assert.equal(f.tooLong, false);
});

// A minimal fake document: createElement returns a plain object standing in for an <option>/<optgroup>.
const fakeDoc = { createElement: tag => ({ tag, disabled: false }) };

test('buildOption uses value and label for an object entry', () => {
    const op = buildOption(fakeDoc, { value: 'a', label: 'Alpha' });
    assert.equal(op.tag, 'option');
    assert.equal(op.value, 'a');
    assert.equal(op.textContent, 'Alpha');
    assert.equal(op.disabled, false);
});
test('buildOption falls back to value as the label, and honours disabled', () => {
    const op = buildOption(fakeDoc, { value: 'b', disabled: true });
    assert.equal(op.value, 'b');
    assert.equal(op.textContent, 'b');
    assert.equal(op.disabled, true);
});
test('buildOption accepts a plain string entry', () => {
    const op = buildOption(fakeDoc, 'CSV');
    assert.equal(op.value, 'CSV');
    assert.equal(op.textContent, 'CSV');
});
test('buildOptions builds a flat list of option elements', () => {
    const ops = buildOptions(fakeDoc, ['CSV', { value: 'JSON', label: 'JSON' }]);
    assert.deepEqual(ops.map(o => o.tag), ['option', 'option']);
    assert.deepEqual(ops.map(o => o.value), ['CSV', 'JSON']);
});
test('buildOptions groups entries with a group key into an optgroup holding its own options', () => {
    const fd = { createElement: tag => (tag === 'optgroup' ? { tag, append(...c) { this.children = c; } } : fakeDoc.createElement(tag)) };
    const [g] = buildOptions(fd, [{ group: 'Fruit', options: ['Apple', 'Pear'] }]);
    assert.equal(g.tag, 'optgroup');
    assert.equal(g.label, 'Fruit');
    assert.deepEqual(g.children.map(o => o.value), ['Apple', 'Pear']);
});
