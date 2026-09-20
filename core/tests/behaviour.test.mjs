// Run with: node --test sdk/tests   (Node 20+, no dependencies). Covers the pure decision functions;
// DOM behaviour (focus hold, Escape) is exercised in the browser through index.html.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tabTarget } from '../components/modal/modal.js';
import { nextTabIndex } from '../components/tabs/tabs.js';

test('tabTarget wraps from the last focusable to the first', () => {
    assert.equal(tabTarget(2, 3, false), 0);
});

test('tabTarget wraps from the first focusable to the last on Shift+Tab', () => {
    assert.equal(tabTarget(0, 3, true), 2);
});

test('tabTarget lets the browser move focus inside the list', () => {
    assert.equal(tabTarget(1, 3, false), null);
    assert.equal(tabTarget(1, 3, true), null);
});

test('tabTarget pulls focus back in when it is outside', () => {
    assert.equal(tabTarget(-1, 3, false), 0);
    assert.equal(tabTarget(-1, 3, true), 2);
});

test('tabTarget with nothing focusable targets the container', () => {
    assert.equal(tabTarget(-1, 0, false), -1);
});

test('nextTabIndex moves with the arrow keys and wraps', () => {
    assert.equal(nextTabIndex(0, 3, 'ArrowRight'), 1);
    assert.equal(nextTabIndex(2, 3, 'ArrowRight'), 0);
    assert.equal(nextTabIndex(0, 3, 'ArrowLeft'), 2);
});

test('nextTabIndex handles Home and End', () => {
    assert.equal(nextTabIndex(1, 4, 'Home'), 0);
    assert.equal(nextTabIndex(1, 4, 'End'), 3);
});

test('nextTabIndex ignores other keys and empty lists', () => {
    assert.equal(nextTabIndex(0, 3, 'a'), null);
    assert.equal(nextTabIndex(0, 0, 'ArrowRight'), null);
});
