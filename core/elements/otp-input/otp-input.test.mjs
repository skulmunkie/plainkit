import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, distribute } from './otp-input.js';

test('sanitize keeps only the alphabet', () => {
    assert.equal(sanitize('12 a-34'), '1234');
    assert.equal(sanitize('a1-b2', 'alnum'), 'a1b2');
    assert.equal(sanitize('a b', 'any'), 'ab');
    assert.equal(sanitize(null), '');
});
test('distribute takes the characters that fit from the start cell', () => {
    assert.deepEqual(distribute('123456', 4), ['1', '2', '3', '4']);
    assert.deepEqual(distribute('123456', 6, 4), ['1', '2']);
    assert.deepEqual(distribute('12', 6, 6), []);
});
