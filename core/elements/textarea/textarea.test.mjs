import test from 'node:test';
import assert from 'node:assert/strict';
import { flagsOf, autogrowHeight } from './textarea.js';

test('autogrowHeight adds the borders and honours the cap', () => {
    assert.equal(autogrowHeight(100, 2), 102);
    assert.equal(autogrowHeight(500, 2, 240), 240);
    assert.equal(autogrowHeight(100, 2, 240), 102);
});
test('flagsOf copies every ValidityState-like flag', () => {
    const f = flagsOf({ valueMissing: true, tooLong: false });
    assert.equal(f.valueMissing, true);
    assert.equal(f.tooLong, false);
});
