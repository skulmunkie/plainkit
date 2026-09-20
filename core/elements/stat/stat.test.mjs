// Tests for the stat tile logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { delta, formatDelta, isGood, deltaSpeech } from './stat.js';

test('delta gives direction and a one-decimal percentage', () => {
    assert.deepEqual(delta(112.5, 100), { direction: 'up', pct: 12.5 });
    assert.deepEqual(delta(97, 100), { direction: 'down', pct: -3 });
    assert.deepEqual(delta(100, 100), { direction: 'flat', pct: 0 });
    assert.equal(delta(100.01, 100).direction, 'flat');
});

test('delta copes with a missing or zero previous value', () => {
    assert.deepEqual(delta(5, 0), { direction: 'up', pct: null });
    assert.deepEqual(delta(0, 0), { direction: 'flat', pct: null });
    assert.deepEqual(delta(5, undefined), { direction: 'up', pct: null });
    assert.equal(delta(-50, -100).direction, 'up');
});

test('formatDelta signs positives and names a new value', () => {
    assert.equal(formatDelta({ direction: 'up', pct: 12.5 }), '+12.5%');
    assert.equal(formatDelta({ direction: 'down', pct: -3 }), '-3%');
    assert.equal(formatDelta({ direction: 'flat', pct: 0 }), '0%');
    assert.equal(formatDelta({ direction: 'up', pct: null }), 'New');
});

test('isGood flips for down-is-good metrics and is null for flat', () => {
    assert.equal(isGood('up'), true);
    assert.equal(isGood('down'), false);
    assert.equal(isGood('down', true), true);
    assert.equal(isGood('flat'), null);
});

test('deltaSpeech reads the change out loud', () => {
    assert.equal(deltaSpeech({ direction: 'up', pct: 12.5 }, 'last month'), 'up 12.5 percent versus last month');
    assert.equal(deltaSpeech({ direction: 'down', pct: -3 }), 'down 3 percent versus the previous period');
    assert.equal(deltaSpeech({ direction: 'flat', pct: 0 }), 'unchanged versus the previous period');
});
