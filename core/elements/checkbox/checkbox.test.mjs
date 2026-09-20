import test from 'node:test';
import assert from 'node:assert/strict';
import { triState, flagsOf } from './checkbox.js';

test('triState is none for nothing or an empty group, all when every box is checked, otherwise some', () => {
    assert.equal(triState(0, 0), 'none');
    assert.equal(triState(0, 3), 'none');
    assert.equal(triState(3, 3), 'all');
    assert.equal(triState(1, 3), 'some');
});
test('flagsOf copies every ValidityState-like flag', () => {
    const f = flagsOf({ valueMissing: true, tooLong: false });
    assert.equal(f.valueMissing, true);
    assert.equal(f.tooLong, false);
});
