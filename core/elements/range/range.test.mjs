import test from 'node:test';
import assert from 'node:assert/strict';
import { fraction, clampPair } from './range.js';

test('fraction maps a value into 0..1, clamps, and is 0 for an empty range', () => {
    assert.equal(fraction(50, 0, 100), 0.5);
    assert.equal(fraction(150, 0, 100), 1);
    assert.equal(fraction(-5, 0, 100), 0);
    assert.equal(fraction(5, 5, 5), 0);
});
test('clampPair stops the moved thumb at the other one', () => {
    assert.deepEqual(clampPair(30, 60, 'lo'), [30, 60]);
    assert.deepEqual(clampPair(70, 60, 'lo'), [60, 60]);
    assert.deepEqual(clampPair(30, 20, 'hi'), [30, 30]);
});
