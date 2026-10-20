// Tests for the pure viewport pan/zoom logic behind the canvas work (core/js/viewport-logic.js, #430 step 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { toScreen, toWorld, clampZoom, pan, zoomAt, toOrigin, fromOrigin, zoomToFit, centerOn } from '../js/viewport-logic.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `expected ${a} to be within ${eps} of ${b}`);
const closePoint = (a, b, eps = 1e-9) => { close(a.x, b.x, eps); close(a.y, b.y, eps); };

test('toScreen maps the world origin and scales by zoom', () => {
    const vp = { x: 0, y: 0, zoom: 2 };
    assert.deepEqual(toScreen(vp, { x: 0, y: 0 }), { x: 0, y: 0 });
    assert.deepEqual(toScreen(vp, { x: 10, y: 5 }), { x: 20, y: 10 });
});

test('toScreen accounts for the viewport origin', () => {
    const vp = { x: 100, y: 50, zoom: 1 };
    assert.deepEqual(toScreen(vp, { x: 100, y: 50 }), { x: 0, y: 0 });
    assert.deepEqual(toScreen(vp, { x: 110, y: 60 }), { x: 10, y: 10 });
});

test('toWorld is the exact inverse of toScreen', () => {
    const vp = { x: 37, y: -12, zoom: 1.75 };
    for (const p of [{ x: 0, y: 0 }, { x: 400, y: 300 }, { x: -50, y: 12.5 }]) {
        closePoint(toWorld(vp, toScreen(vp, p)), p);
        closePoint(toScreen(vp, toWorld(vp, p)), p);
    }
});

test('clampZoom clamps to [min, max] and passes values inside the range through unchanged', () => {
    assert.equal(clampZoom(5, 1, 10), 5);
    assert.equal(clampZoom(0.5, 1, 10), 1);
    assert.equal(clampZoom(50, 1, 10), 10);
});

test('clampZoom defaults to no upper limit, and a lower limit of 0 (zoom cannot go negative)', () => {
    assert.equal(clampZoom(1e6), 1e6);
    assert.equal(clampZoom(-5), 0);
    assert.equal(clampZoom(0.001), 0.001);
});

test('clampZoom tolerates a swapped min/max', () => {
    assert.equal(clampZoom(5, 10, 1), 5);
    assert.equal(clampZoom(0, 10, 1), 1);
    assert.equal(clampZoom(50, 10, 1), 10);
});

test('pan moves the viewport origin by the screen delta divided by zoom, and keeps zoom unchanged', () => {
    const vp = { x: 0, y: 0, zoom: 2 };
    assert.deepEqual(pan(vp, 20, 10), { x: -10, y: -5, zoom: 2 });
});

test('pan at zoom 1 moves the origin by exactly the screen delta', () => {
    const vp = { x: 5, y: 5, zoom: 1 };
    assert.deepEqual(pan(vp, 3, -4), { x: 2, y: 9, zoom: 1 });
});

test('pan does not mutate its input', () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    const copy = { ...vp };
    pan(vp, 10, 10);
    assert.deepEqual(vp, copy);
});

test('a screen point that was under the pointer stays under it after a pan by that same delta', () => {
    const vp = { x: 10, y: 10, zoom: 3 };
    const screenPoint = { x: 40, y: 60 };
    const worldUnderPointer = toWorld(vp, screenPoint);
    const next = pan(vp, 15, -8);
    closePoint(toWorld(next, { x: screenPoint.x + 15, y: screenPoint.y - 8 }), worldUnderPointer);
});

test('zoomAt keeps the world point under the focal point fixed on screen', () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    const focal = { x: 120, y: 80 };
    const worldBefore = toWorld(vp, focal);
    const next = zoomAt(vp, 2, focal.x, focal.y);
    assert.equal(next.zoom, 2);
    closePoint(toScreen(next, worldBefore), focal);
});

test('zoomAt zooming out keeps the same invariant', () => {
    const vp = { x: 50, y: 50, zoom: 4 };
    const focal = { x: 200, y: 150 };
    const worldBefore = toWorld(vp, focal);
    const next = zoomAt(vp, 0.5, focal.x, focal.y);
    assert.equal(next.zoom, 2);
    closePoint(toScreen(next, worldBefore), focal);
});

test('zoomAt clamps the resulting zoom to [min, max]', () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    const clampedUp = zoomAt(vp, 100, 0, 0, { min: 0.1, max: 8 });
    assert.equal(clampedUp.zoom, 8);
    const clampedDown = zoomAt(vp, 0.001, 0, 0, { min: 0.1, max: 8 });
    assert.equal(clampedDown.zoom, 0.1);
});

test('zoomAt still fixes the focal point exactly when the zoom was clamped', () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    const focal = { x: 300, y: 200 };
    const worldBefore = toWorld(vp, focal);
    const next = zoomAt(vp, 1000, focal.x, focal.y, { min: 0.1, max: 8 });
    assert.equal(next.zoom, 8);
    closePoint(toScreen(next, worldBefore), focal);
});

test('zoomAt with factor 1 is a no-op (within floating point epsilon)', () => {
    const vp = { x: 12, y: -7, zoom: 3 };
    const next = zoomAt(vp, 1, 55, 44);
    close(next.x, vp.x);
    close(next.y, vp.y);
    assert.equal(next.zoom, vp.zoom);
});

test('zoomAt does not mutate its input', () => {
    const vp = { x: 0, y: 0, zoom: 1 };
    const copy = { ...vp };
    zoomAt(vp, 2, 10, 10);
    assert.deepEqual(vp, copy);
});

test('repeated zoom-in/zoom-out at the same focal point round-trips the viewport', () => {
    let vp = { x: 5, y: 5, zoom: 1 };
    const focal = { x: 150, y: 90 };
    for (let i = 0; i < 5; i++) vp = zoomAt(vp, 1.3, focal.x, focal.y);
    for (let i = 0; i < 5; i++) vp = zoomAt(vp, 1 / 1.3, focal.x, focal.y);
    close(vp.zoom, 1, 1e-6);
    close(vp.x, 5, 1e-6);
    close(vp.y, 5, 1e-6);
});

test('toOrigin and fromOrigin convert between the two forms of a view', () => {
    const vp = { x: 12, y: -7, zoom: 2.5 };
    const o = toOrigin(vp);
    close(o.x, -30, 1e-9); close(o.y, 17.5, 1e-9);
    const back = fromOrigin(o);
    close(back.x, vp.x, 1e-9); close(back.y, vp.y, 1e-9); assert.equal(back.zoom, 2.5);
    // The origin form puts the world origin at (o.x, o.y) in pixels.
    const s = toScreen(vp, { x: 0, y: 0 });
    close(s.x, o.x, 1e-9); close(s.y, o.y, 1e-9);
});

test('zoomToFit contains the rect, centres it and respects the limits', () => {
    const r = { x: 100, y: 50, w: 400, h: 200 };
    const vp = zoomToFit(r, 800, 600, 20);
    close(vp.zoom, 1.9, 1e-9); // (800 - 40) / 400 is the tighter side
    const a = toScreen(vp, { x: r.x, y: r.y }), b = toScreen(vp, { x: r.x + r.w, y: r.y + r.h });
    assert.ok(a.x >= 20 - 1e-6 && b.x <= 780 + 1e-6 && a.y >= 20 - 1e-6 && b.y <= 580 + 1e-6, 'inside the padded container');
    close((a.x + b.x) / 2, 400, 1e-6); close((a.y + b.y) / 2, 300, 1e-6);
    assert.equal(zoomToFit(r, 800, 600, 20, { max: 1 }).zoom, 1, 'the limit holds');
    assert.equal(zoomToFit(r, 800, 600, 20, { min: 3 }).zoom, 3);
});

test('centerOn puts a world point in the middle and keeps the zoom', () => {
    const vp = centerOn({ x: 0, y: 0, zoom: 2 }, 100, 40, 800, 600);
    assert.equal(vp.zoom, 2);
    const s = toScreen(vp, { x: 100, y: 40 });
    close(s.x, 400, 1e-9); close(s.y, 300, 1e-9);
});
