// Unit tests for the nav component's behaviour. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOpen } from './nav.js';

test('nextOpen toggles, opens, and closes on close, escape and outside', () => {
    assert.equal(nextOpen(false, 'toggle'), true);
    assert.equal(nextOpen(true, 'toggle'), false);
    assert.equal(nextOpen(false, 'open'), true);
    for (const e of ['close', 'escape', 'outside']) assert.equal(nextOpen(true, e), false, e);
    assert.equal(nextOpen(true, 'unknown'), true);
});
