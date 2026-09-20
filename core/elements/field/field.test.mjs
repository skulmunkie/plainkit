import test from 'node:test';
import assert from 'node:assert/strict';
import { counterText, counterState, describe } from './field.js';

test('counterText is the plain length without a max and "n / max" with one', () => {
    assert.equal(counterText(4, 0), '4');
    assert.equal(counterText(4, 80), '4 / 80');
});
test('counterState is ok, near from 90% of the max, and over past it', () => {
    assert.equal(counterState(4, 0), 'ok');
    assert.equal(counterState(71, 80), 'ok');
    assert.equal(counterState(72, 80), 'near');
    assert.equal(counterState(80, 80), 'near');
    assert.equal(counterState(81, 80), 'over');
});
test('describe joins the non-empty pieces of help, error and warning text', () => {
    assert.equal(describe('Help.', '', 'Bad.'), 'Help. Bad.');
    assert.equal(describe('', '', ''), '');
});
