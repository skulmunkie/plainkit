import test from 'node:test';
import assert from 'node:assert/strict';
import { starsOn, ratingText } from './rating.js';

test('starsOn lights every star up to the value', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(i => starsOn(3, i)), [true, true, true, false, false]);
    assert.equal(starsOn(0, 1), false);
});
test('ratingText reads as "n out of max stars"', () => {
    assert.equal(ratingText(4, 5), '4 out of 5 stars');
});
