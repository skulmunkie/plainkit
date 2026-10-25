// The snapping maths of pk-canvas (js/canvas-snap.js, #430 phase C5): nearest line within the threshold per axis, edges to edges and the grid,
// centres to centres, guides to both, ties in a fixed order, idempotent, never a throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { snapValue, snapRect } from '../js/canvas-snap.js';

test('snapValue: the nearest line within the threshold, else the value unchanged', () => {
    assert.deepEqual(snapValue(12, [0, 10, 20], 3), { value: 10, line: 10 });
    assert.deepEqual(snapValue(15, [0, 10, 20], 3), { value: 15, line: null });
    assert.deepEqual(snapValue(19, [10, 20], 3), { value: 20, line: 20 });
});

test('grid: each axis on its own; the start edge wins a tie with the end edge', () => {
    const r = snapRect({ x: 13, y: 7, w: 20, h: 10 }, { grid: 10, threshold: 4 });
    assert.deepEqual(r.rect, { x: 10, y: 10, w: 20, h: 10 });
    assert.deepEqual(r.hits, [{ axis: 'x', at: 10, source: 'grid' }, { axis: 'y', at: 10, source: 'grid' }]);
});

test('target edges: the moving end edge meets the target start edge; an axis with nothing near stays', () => {
    const r = snapRect({ x: 28, y: 100, w: 20, h: 10 }, { targets: [{ id: 'b', x: 50, y: 0, w: 10, h: 10 }], threshold: 3 });
    assert.deepEqual(r.rect, { x: 30, y: 100, w: 20, h: 10 });
    assert.deepEqual(r.hits, [{ axis: 'x', at: 50, source: 'edge', id: 'b' }]);
});

test('centres pair with centres only; guides take edges and centres; edges false ignores target edges', () => {
    const t = [{ id: 'c', x: 20, y: 0, w: 30, h: 10 }];
    const c = snapRect({ x: 34, y: 40, w: 4, h: 4 }, { targets: t, threshold: 2, centres: true });
    assert.deepEqual(c.rect, { x: 33, y: 40, w: 4, h: 4 });
    assert.deepEqual(c.hits, [{ axis: 'x', at: 35, source: 'centre', id: 'c' }]);
    const g = snapRect({ x: 0, y: 97, w: 10, h: 10 }, { guides: [{ axis: 'y', at: 100 }, { axis: 'x', at: 'no' }, null], threshold: 4 });
    assert.deepEqual(g.rect, { x: 0, y: 100, w: 10, h: 10 }); assert.deepEqual(g.hits, [{ axis: 'y', at: 100, source: 'guide' }]);
    const n = snapRect({ x: 28, y: 0, w: 20, h: 10 }, { targets: [{ id: 'b', x: 50, y: 300, w: 10, h: 10 }], threshold: 3, edges: false });
    assert.deepEqual(n.hits, []);
});

test('a guide beats a target and the grid at the same distance; no threshold snaps nothing', () => {
    const r = snapRect({ x: 12, y: 505, w: 6, h: 1 }, { grid: 10, guides: [{ axis: 'x', at: 10 }], targets: [{ id: 't', x: 14, y: 900, w: 1, h: 1 }], threshold: 3 });
    assert.deepEqual(r.hits, [{ axis: 'x', at: 10, source: 'guide' }]);
    const z = snapRect({ x: 13, y: 7, w: 20, h: 10 }, { grid: 10 });
    assert.deepEqual(z, { rect: { x: 13, y: 7, w: 20, h: 10 }, hits: [] });
});

test('idempotent: a snapped rect snaps to itself; hostile targets are ignored, never a throw', () => {
    const opts = { grid: 8, guides: [{ axis: 'x', at: 33 }], targets: [{ x: 40, y: 40, w: 16, h: 16 }, {}, null, { x: NaN, y: 1, w: 1, h: 1 }], threshold: 5, centres: true };
    for (const start of [{ x: 1, y: 2, w: 10, h: 10 }, { x: 31, y: 37, w: 5, h: 9 }, { x: -7, y: 44, w: 3, h: 3 }]) {
        const once = snapRect(start, opts).rect;
        assert.deepEqual(snapRect(once, opts).rect, once);
    }
});

test('canvas-snap is in the plainkit.canvas package, not core', () => {
    const canvas = JSON.parse(fs.readFileSync(new URL('../../packages.json', import.meta.url), 'utf8')).packages.find(p => p.id === 'plainkit.canvas');
    assert.ok(canvas.js.includes('canvas-snap.js'));
});
