// Unit tests for the design surface's pure maths. Pan, zoom and the marks are measured in the browser suite (tests/browser/cases-design-surface.js)
// and the review scenario (design-surface).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clampZoom, toWorld, toScreen, snap, zoomAt, markBox } from './design-surface.js';

test('zoom is clamped between its limits', () => {
    assert.equal(clampZoom(10, 0.25, 4), 4);
    assert.equal(clampZoom(0.01, 0.25, 4), 0.25);
    assert.equal(clampZoom(2, 0.25, 4), 2);
});

test('screen and world points convert both ways', () => {
    const v = { x: 100, y: -20, zoom: 2 };
    const w = toWorld(v, 140, 20);
    assert.deepEqual(w, { x: 20, y: 20 });
    assert.deepEqual(toScreen(v, w.x, w.y), { x: 140, y: 20 });
});

test('zooming keeps the point under the pointer where it is', () => {
    const v = { x: 30, y: 10, zoom: 1 };
    const before = toWorld(v, 200, 120), after = zoomAt(v, 2, 200, 120, 0.25, 4);
    assert.equal(after.zoom, 2);
    assert.deepEqual(toWorld(after, 200, 120), before);
    assert.equal(zoomAt(v, 100, 0, 0, 0.25, 4).zoom, 4, 'the limit holds');
});

test('snap rounds to the grid and does nothing without one', () => {
    assert.equal(snap(37, 20), 40);
    assert.equal(snap(29, 20), 20);
    assert.equal(snap(37, 0), 37);
});

test('a mark box is the node rectangle relative to the frame', () => {
    assert.deepEqual(markBox({ left: 50, top: 70, width: 10, height: 20 }, { left: 40, top: 60 }), { left: 10, top: 10, width: 10, height: 20 });
});

test('the surface observes its own subtree and lets go on disconnect', () => {
    const src = fs.readFileSync(new URL('./design-surface.js', import.meta.url), 'utf8');
    assert.match(src, /disconnected\(\) \{ this\.\$mo\?\.disconnect\(\); this\.\$ro\?\.disconnect\(\); \}/);
});
