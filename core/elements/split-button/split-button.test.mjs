import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMenuIndex, placementFor } from './split-button.js';

test('nextMenuIndex wraps, jumps to the ends and ignores other keys', () => {
    assert.equal(nextMenuIndex(-1, 3, 'ArrowDown'), 0);
    assert.equal(nextMenuIndex(2, 3, 'ArrowDown'), 0);
    assert.equal(nextMenuIndex(0, 3, 'ArrowUp'), 2);
    assert.equal(nextMenuIndex(1, 3, 'Home'), 0);
    assert.equal(nextMenuIndex(0, 3, 'End'), 2);
    assert.equal(nextMenuIndex(0, 3, 'x'), null);
    assert.equal(nextMenuIndex(0, 0, 'Home'), null);
});
test('placementFor flips upward only when it does not fit below and there is more room above', () => {
    assert.equal(placementFor(300, 100, 200), 'bottom');
    assert.equal(placementFor(100, 400, 200), 'top');
    assert.equal(placementFor(100, 50, 200), 'bottom');
});
