// Unit tests for the toast decisions. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePosition, normalizeKind, roleFor, durationFor, showCount, remainingAfter, createQueue, POSITIONS } from './toast.js';

test('unknown positions and kinds fall back to the defaults, known ones pass through', () => {
    assert.equal(normalizePosition('nowhere'), 'bottom-end');
    for (const p of POSITIONS) assert.equal(normalizePosition(p), p);
    assert.equal(normalizeKind('loud'), 'info');
    assert.equal(normalizeKind('danger'), 'danger');
});

test('warnings and errors are announced assertively, the rest politely', () => {
    assert.equal(roleFor('danger'), 'alert');
    assert.equal(roleFor('warning'), 'alert');
    assert.equal(roleFor('success'), 'status');
    assert.equal(roleFor('info'), 'status');
});

test('a toast with an action stays longer, and zero means it stays until dismissed', () => {
    assert.equal(durationFor(undefined, false), 5000);
    assert.equal(durationFor(undefined, true), 8000);
    assert.equal(durationFor(2000, true), 2000);
    assert.equal(durationFor(0, true), 0);
    assert.equal(durationFor(-1, false), 5000);
});

test('the queue shows what fits and no more', () => {
    assert.equal(showCount(0, 3, 5), 3);
    assert.equal(showCount(2, 3, 5), 1);
    assert.equal(showCount(3, 3, 5), 0);
    assert.equal(showCount(0, 3, 0), 0);
    assert.equal(showCount(0, 0, 2), 2);
});

test('pausing keeps the time that is left; a sticky toast has none', () => {
    assert.equal(remainingAfter(5000, 1500), 3500);
    assert.equal(remainingAfter(5000, 9000), 0);
    assert.equal(remainingAfter(0, 100), 0);
});

test('closing a visible toast lets the next waiting one appear, in order', () => {
    const q = createQueue(2);
    assert.deepEqual(q.push('a'), ['a']);
    assert.deepEqual(q.push('b'), ['b']);
    assert.deepEqual(q.push('c'), []);
    assert.deepEqual(q.push('d'), []);
    assert.equal(q.waitingCount, 2);
    assert.deepEqual(q.close('a'), ['c']);
    assert.deepEqual(q.close('b'), ['d']);
    assert.equal(q.visibleCount, 2);
});

test('closing a toast that is still waiting removes it without showing anything', () => {
    const q = createQueue(1);
    q.push('a'); q.push('b');
    assert.deepEqual(q.close('b'), []);
    assert.equal(q.waitingCount, 0);
});

