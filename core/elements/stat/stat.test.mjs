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

// Issue #8: a point delta (an absolute change in points) beside the percentage one.
test('formatDelta and deltaSpeech read a change in points when the unit is points', () => {
    assert.equal(formatDelta({ direction: 'up', pct: 4 }, 'points'), '+4 pts');
    assert.equal(formatDelta({ direction: 'down', pct: -2.5 }, 'points'), '-2.5 pts');
    assert.equal(formatDelta({ direction: 'flat', pct: 0 }, 'points'), '0 pts');
    assert.equal(formatDelta({ direction: 'up', pct: 12.5 }), '+12.5%');
    assert.equal(deltaSpeech({ direction: 'up', pct: 4 }, 'last run', 'points'), 'up 4 points versus last run');
    assert.equal(deltaSpeech({ direction: 'down', pct: -1 }, 'last run', 'points'), 'down 1 point versus last run');
    assert.equal(deltaSpeech({ direction: 'up', pct: 4 }, 'last run'), 'up 4 percent versus last run');
});
test('deltaUnit is an additive enum defaulting to percent', async () => {
    const fs = await import('node:fs'); const { fileURLToPath } = await import('node:url');
    const meta = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./stat.meta.json', import.meta.url)), 'utf8'));
    const p = meta.props.find(x => x.name === 'deltaUnit');
    assert.equal(p.default, 'percent'); assert.deepEqual(p.values, ['percent', 'points']); assert.equal(p.reflect, true);
});
