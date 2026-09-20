import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHex } from './colour-input.js';

test('normalizeHex accepts 3 and 6 digit hex with or without # and refuses anything else', () => {
    assert.equal(normalizeHex('#ABC'), '#aabbcc');
    assert.equal(normalizeHex('4a90e2'), '#4a90e2');
    assert.equal(normalizeHex(' #4A90E2 '), '#4a90e2');
    assert.equal(normalizeHex('#12'), null);
    assert.equal(normalizeHex('#gggggg'), null);
    assert.equal(normalizeHex(''), null);
});
