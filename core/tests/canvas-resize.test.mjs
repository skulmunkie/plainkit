// The pure resize maths of pk-canvas (js/canvas-geometry.js, #430 phase C4): the eight handles and resizeRect with the opposite side fixed, a minimum,
// no flipping, the aspect ratio on corners and resizing about the centre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDLES, handles, resizeRect } from '../js/canvas-geometry.js';

const near = (a, b, msg) => { for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${msg}: ${k} ${a[k]} != ${b[k]}`); };
const R = { x: 0, y: 0, w: 100, h: 50 };

test('handles: corners then edge midpoints, in the rect\'s units', () => {
    assert.deepEqual(HANDLES, ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w']);
    assert.deepEqual(handles({ x: 10, y: 20, w: 10, h: 20 }).map(h => [h.name, h.x, h.y]), [
        ['nw', 10, 20], ['ne', 20, 20], ['se', 20, 40], ['sw', 10, 40], ['n', 15, 20], ['e', 20, 30], ['s', 15, 40], ['w', 10, 30],
    ]);
});

test('resizeRect: the opposite side stays; an edge handle changes one dimension only', () => {
    near(resizeRect(R, 'se', 10, 5), { x: 0, y: 0, w: 110, h: 55 }, 'se');
    near(resizeRect(R, 'nw', 10, 10), { x: 10, y: 10, w: 90, h: 40 }, 'nw');
    near(resizeRect(R, 'e', 10, 30), { x: 0, y: 0, w: 110, h: 50 }, 'e ignores dy');
    near(resizeRect(R, 'n', 30, -10), { x: 0, y: -10, w: 100, h: 60 }, 'n ignores dx');
});

test('resizeRect: never below min and never flipped past the opposite side', () => {
    near(resizeRect(R, 'w', 150, 0), { x: 99, y: 0, w: 1, h: 50 }, 'w past the right side stops at min 1');
    near(resizeRect(R, 'se', -500, -500, { min: 4 }), { x: 0, y: 0, w: 4, h: 4 }, 'min 4');
});

test('resizeRect: ratio keeps the aspect ratio on corners (the larger change wins), not on edges; centre keeps the centre', () => {
    near(resizeRect(R, 'se', 20, 0, { ratio: true }), { x: 0, y: 0, w: 120, h: 60 }, 'se ratio');
    near(resizeRect(R, 'nw', -20, 0, { ratio: true }), { x: -20, y: -10, w: 120, h: 60 }, 'nw ratio keeps the se corner');
    near(resizeRect(R, 'e', 10, 0, { ratio: true }), { x: 0, y: 0, w: 110, h: 50 }, 'edge ignores ratio');
    near(resizeRect(R, 'e', 10, 0, { centre: true }), { x: -10, y: 0, w: 120, h: 50 }, 'centre: both sides move');
    near(resizeRect(R, 'se', 10, 10, { centre: true, ratio: true }), { x: -20, y: -10, w: 140, h: 70 }, 'centre and ratio');
});
