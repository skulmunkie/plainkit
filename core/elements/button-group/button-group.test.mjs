import test from 'node:test';
import assert from 'node:assert/strict';
import { afterToggle } from './button-group.js';

test('single mode presses the changed button and releases the others, even if it was just released', () => {
    assert.deepEqual(afterToggle('single', [true, false, false], 1), [false, true, false]);
    assert.deepEqual(afterToggle('single', [false, true, false], 1), [false, true, false]);
});
test('multi and none modes leave the states as they are', () => {
    assert.deepEqual(afterToggle('multi', [true, false], 1), [true, false]);
    assert.deepEqual(afterToggle('none', [true, false], 0), [true, false]);
});
