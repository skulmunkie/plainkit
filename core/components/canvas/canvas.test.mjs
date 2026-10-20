// Unit tests for the canvas's own maths. The view maths (toWorld, zoomAt, zoomToFit ...) is js/viewport-logic.js and tested in tests/viewport-logic.test.mjs.
// Pan, zoom, the wheel and the marks are measured in the browser suite (tests/browser/cases-canvas.js) and the review scenario (canvas-wheel).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { snap, markBox } from './canvas.js';

test('snap rounds to the grid and does nothing without one', () => {
    assert.equal(snap(37, 20), 40);
    assert.equal(snap(29, 20), 20);
    assert.equal(snap(37, 0), 37);
});

test('a mark box is the node rectangle relative to the frame', () => {
    assert.deepEqual(markBox({ left: 50, top: 70, width: 10, height: 20 }, { left: 40, top: 60 }), { left: 10, top: 10, width: 10, height: 20 });
});

test('the view maths is imported from viewport-logic, not copied', () => {
    const src = fs.readFileSync(new URL('./canvas.js', import.meta.url), 'utf8');
    assert.match(src, /from '\.\.\/\.\.\/js\/viewport-logic\.js'/);
    assert.doesNotMatch(src, /export (const|function) (clampZoom|toWorld|toScreen|zoomAt)\b/);
});

test('the surface observes its own subtree and lets go on disconnect', () => {
    const src = fs.readFileSync(new URL('./canvas.js', import.meta.url), 'utf8');
    assert.match(src, /disconnected\(\) \{ this\.\$mo\?\.disconnect\(\); this\.\$ro\?\.disconnect\(\); \}/);
});
