// Tests for the design-surface rectangle maths. Run: node --test core/elements/design-surface
import test from 'node:test';
import assert from 'node:assert/strict';
import { relRect, deepestAt, placeChip, revealDelta } from './design-surface.js';

const rect = (left, top, width, height) => ({ left, top, width, height });

test('relRect moves a rectangle into the origin rectangle\'s coordinates and keeps its size', () => {
    assert.deepEqual(relRect(rect(120, 90, 40, 30), rect(100, 50, 500, 400)), rect(20, 40, 40, 30));
});

test('deepestAt picks the deepest node under the point, the later one on a tie, and -1 for bare ground', () => {
    const items = [{ depth: 1, rect: rect(0, 0, 200, 200) }, { depth: 2, rect: rect(10, 10, 100, 100) }, { depth: 3, rect: rect(20, 20, 30, 30) }, { depth: 3, rect: rect(25, 25, 30, 30) }];
    assert.equal(deepestAt(items, 150, 150), 0);
    assert.equal(deepestAt(items, 90, 90), 1);
    assert.equal(deepestAt(items, 22, 22), 2);
    assert.equal(deepestAt(items, 30, 30), 3, 'overlapping siblings: the later one wins');
    assert.equal(deepestAt(items, 500, 500), -1);
});

test('placeChip puts the chip above the node, right edges aligned', () => {
    assert.deepEqual(placeChip(rect(100, 100, 200, 60), rect(0, 0, 80, 30), rect(0, 0, 600, 400), 4), { left: 220, top: 66 });
});

test('placeChip clamps at the right edge so the chip stays inside the bounds', () => {
    const at = placeChip(rect(500, 100, 200, 60), rect(0, 0, 80, 30), rect(0, 0, 600, 400), 4);
    assert.equal(at.left, 520);
});

test('placeChip near the top goes inside the node\'s top edge, and below it when inside would cover the top-left corner', () => {
    assert.deepEqual(placeChip(rect(100, 10, 200, 60), rect(0, 0, 80, 30), rect(0, 0, 600, 400), 4), { left: 220, top: 14 });
    const narrow = placeChip(rect(100, 10, 40, 60), rect(0, 0, 80, 30), rect(0, 0, 600, 400), 4);
    assert.equal(narrow.top, 74, 'a chip wider than the node sits below it');
});

test('placeChip returns null when the node is outside the bounds, and keeps a chip above a node near the bottom', () => {
    assert.equal(placeChip(rect(100, -80, 200, 60), rect(0, 0, 80, 30), rect(0, 0, 600, 400), 4), null);
    assert.equal(placeChip(rect(100, 450, 200, 60), rect(0, 0, 80, 30), rect(0, 0, 600, 400), 4), null);
    assert.equal(placeChip(rect(100, 380, 40, 60), rect(0, 0, 80, 30), rect(0, 0, 600, 400), 4).top, 346);
});

test('revealDelta scrolls only as far as the margin needs, in either direction, and not at all when the node shows', () => {
    const view = { left: 0, top: 100, right: 400, bottom: 300 };
    assert.deepEqual(revealDelta({ left: 50, top: 150, right: 100, bottom: 200 }, view, 8), { dx: 0, dy: 0 });
    assert.deepEqual(revealDelta({ left: 50, top: 20, right: 100, bottom: 60 }, view, 8), { dx: 0, dy: -88 });
    assert.deepEqual(revealDelta({ left: 50, top: 320, right: 100, bottom: 360 }, view, 8), { dx: 0, dy: 68 });
    assert.deepEqual(revealDelta({ left: 380, top: 150, right: 450, bottom: 200 }, view, 8), { dx: 58, dy: 0 });
});
