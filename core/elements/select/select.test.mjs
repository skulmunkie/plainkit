import test from 'node:test';
import assert from 'node:assert/strict';
import { flagsOf, selectedValues } from './select.js';

test('selectedValues returns the values of the selected options in order', () => {
    assert.deepEqual(selectedValues([{ value: 'a', selected: true }, { value: 'b', selected: false }, { value: 'c', selected: true }]), ['a', 'c']);
    assert.deepEqual(selectedValues([]), []);
});
test('flagsOf copies every ValidityState-like flag', () => {
    const f = flagsOf({ valueMissing: true, tooLong: false });
    assert.equal(f.valueMissing, true);
    assert.equal(f.tooLong, false);
});
