import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyStep, stepIndex, navigable } from '../js/roving.js';

test('keyStep: vertical, horizontal, RTL and Home/End', () => {
    assert.equal(keyStep('ArrowUp'), -1);
    assert.equal(keyStep('ArrowDown'), 1);
    assert.equal(keyStep('ArrowLeft'), 0);
    assert.equal(keyStep('ArrowLeft', { horizontal: true }), -1);
    assert.equal(keyStep('ArrowRight', { horizontal: true }), 1);
    assert.equal(keyStep('ArrowLeft', { horizontal: true, rtl: true }), 1);
    assert.equal(keyStep('ArrowRight', { horizontal: true, rtl: true }), -1);
    assert.equal(keyStep('Home'), 'start');
    assert.equal(keyStep('End', { horizontal: true }), 'end');
    assert.equal(keyStep('a'), 0);
});

test('stepIndex: clamps at the ends, null at an edge, undefined for other keys', () => {
    assert.equal(stepIndex('ArrowDown', 0, 3), 1);
    assert.equal(stepIndex('ArrowUp', 2, 3), 1);
    assert.equal(stepIndex('ArrowDown', 2, 3), null);
    assert.equal(stepIndex('ArrowUp', 0, 3), null);
    assert.equal(stepIndex('Home', 2, 3), 0);
    assert.equal(stepIndex('End', 0, 3), 2);
    assert.equal(stepIndex('Enter', 0, 3), undefined);
    assert.equal(stepIndex('ArrowDown', 0, 0), undefined);
    assert.equal(stepIndex('ArrowDown', -1, 3), 0);
});

test('stepIndex: wrap and horizontal RTL', () => {
    assert.equal(stepIndex('ArrowDown', 2, 3, { wrap: true }), 0);
    assert.equal(stepIndex('ArrowUp', 0, 3, { wrap: true }), 2);
    assert.equal(stepIndex('ArrowRight', 0, 3, { horizontal: true }), 1);
    assert.equal(stepIndex('ArrowRight', 1, 3, { horizontal: true, rtl: true }), 0);
    assert.equal(stepIndex('ArrowUp', 1, 3, { horizontal: true }), undefined);
});

test('navigable: skips disabled and hidden, and what `extra` refuses', () => {
    const a = {}, b = { disabled: true }, c = { hidden: true }, d = { n: 1 };
    assert.deepEqual(navigable([a, b, c, d]), [a, d]);
    assert.deepEqual(navigable([a, b, c, d], x => x.n), [d]);
});
