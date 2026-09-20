// Unit tests for the stepper's step states and navigation. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepStates, canEnter, stepKey, stepLabel } from './stepper.js';

test('steps before the current are done, the current is active, later ones are todo', () => {
    assert.deepEqual(stepStates(4, 1), ['done', 'active', 'todo', 'todo']);
    assert.deepEqual(stepStates(3, 0), ['active', 'todo', 'todo']);
    assert.deepEqual(stepStates(3, 3), ['done', 'done', 'done']);
});

test('an error wins over position', () => {
    assert.deepEqual(stepStates(4, 2, [0]), ['error', 'done', 'active', 'todo']);
});

test('a linear wizard can go back and stay, never skip ahead; it can return to the furthest step reached', () => {
    assert.equal(canEnter(0, 2), true);
    assert.equal(canEnter(2, 2), true);
    assert.equal(canEnter(3, 2), false);
    assert.equal(canEnter(3, 1, { furthest: 3 }), true);
});

test('a non-linear stepper allows any step inside the range', () => {
    assert.equal(canEnter(3, 0, { linear: false, count: 4 }), true);
    assert.equal(canEnter(4, 0, { linear: false, count: 4 }), false);
    assert.equal(canEnter(-1, 0, { linear: false }), false);
});

test('keys move along the axis of the stepper and stop at the ends', () => {
    assert.equal(stepKey('ArrowRight', 1, 4), 2);
    assert.equal(stepKey('ArrowRight', 3, 4), 3);
    assert.equal(stepKey('ArrowLeft', 0, 4), 0);
    assert.equal(stepKey('ArrowDown', 1, 4), null);
    assert.equal(stepKey('ArrowDown', 1, 4, { vertical: true }), 2);
    assert.equal(stepKey('ArrowLeft', 1, 4, { rtl: true }), 2);
    assert.equal(stepKey('Home', 2, 4), 0);
    assert.equal(stepKey('End', 0, 4), 3);
    assert.equal(stepKey('x', 0, 4), null);
    assert.equal(stepKey('End', 0, 0), null);
});

test('the accessible label says where you are', () => {
    assert.equal(stepLabel(1, 4, 'Pricing', 'active'), 'Step 2 of 4: Pricing, current');
    assert.equal(stepLabel(0, 4, 'Basics', 'done'), 'Step 1 of 4: Basics, completed');
    assert.equal(stepLabel(2, 4, 'Review', 'todo'), 'Step 3 of 4: Review');
    assert.equal(stepLabel(2, 4, 'Review', 'error'), 'Step 3 of 4: Review, has an error');
});

