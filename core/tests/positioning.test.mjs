// Unit tests for the placement geometry. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePosition, isInside, boxOf } from '../js/positioning.js';

const view = { width: 400, height: 300 };
const rect = (left, top, w = 40, h = 20) => ({ left, top, right: left + w, bottom: top + h });
const size = { width: 100, height: 60 };

test('a layer opens below the anchor and centres on it by default', () => {
    const r = computePosition(rect(150, 50), size, view, { offset: 4 });
    assert.equal(r.side, 'bottom');
    assert.equal(r.y, 74);
    assert.equal(r.x, 170 - 50);
});

test('start and end alignment line the layer up with the anchor edges', () => {
    assert.equal(computePosition(rect(150, 50), size, view, { placement: 'bottom-start' }).x, 150);
    assert.equal(computePosition(rect(150, 50), size, view, { placement: 'bottom-end' }).x, 190 - 100);
});

test('it flips to the opposite side when there is no room', () => {
    const low = computePosition(rect(150, 260), size, view, { placement: 'bottom' });
    assert.equal(low.side, 'top');
    assert.equal(low.y, 260 - 60 - 4);
});

test('it stays put when the opposite side is no better', () => {
    const tall = computePosition(rect(150, 160), { width: 100, height: 290 }, view, { placement: 'bottom' });
    assert.equal(tall.side, 'top');
    const huge = computePosition(rect(150, 140), { width: 100, height: 500 }, view, { placement: 'bottom' });
    assert.equal(huge.side, 'bottom');
});

test('flip can be switched off', () => {
    assert.equal(computePosition(rect(150, 260), size, view, { placement: 'bottom', flip: false }).side, 'bottom');
});

test('it shifts along the other axis to stay inside the viewport padding', () => {
    assert.equal(computePosition(rect(0, 50), size, view, { placement: 'bottom', padding: 8 }).x, 8);
    assert.equal(computePosition(rect(380, 50), size, view, { placement: 'bottom', padding: 8 }).x, 400 - 100 - 8);
});

test('left and right placements centre vertically and flip horizontally', () => {
    const r = computePosition(rect(340, 100), size, view, { placement: 'right' });
    assert.equal(r.side, 'left');
    assert.equal(r.x, 340 - 100 - 4);
    assert.equal(computePosition(rect(100, 100), size, view, { placement: 'right' }).y, 110 - 30);
});

test('a point anchor (a context menu at the pointer) has no size', () => {
    const r = computePosition({ left: 30, top: 40, right: 30, bottom: 40 }, size, view, { placement: 'bottom-start', offset: 0 });
    assert.deepEqual([r.x, r.y], [30, 40]);
});

test('a layer wider than the viewport pins to the padding instead of going negative', () => {
    assert.equal(computePosition(rect(10, 10), { width: 900, height: 60 }, view, { padding: 8 }).x, 8);
});

test('isInside is true for a descendant and false for an outsider', () => {
    const inside = { contains: t => t === 'a' };
    assert.equal(isInside('a', [inside, null]), true);
    assert.equal(isInside('b', [inside]), false);
});

test('boxOf uses the union of the children for a box-less display: contents wrapper', () => {
    const box = (l, t, r, b, children) => ({ getBoundingClientRect: () => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }), children });
    const wrapper = box(0, 0, 0, 0, [box(100, 40, 160, 60), box(170, 40, 200, 60)]);
    assert.deepEqual(boxOf(wrapper), { left: 100, top: 40, right: 200, bottom: 60 });
    assert.deepEqual(boxOf(box(5, 5, 25, 15, [box(0, 0, 1, 1)])), { left: 5, top: 5, right: 25, bottom: 15 });
    assert.deepEqual(boxOf(box(0, 0, 0, 0, [])), { left: 0, top: 0, right: 0, bottom: 0 });
});
