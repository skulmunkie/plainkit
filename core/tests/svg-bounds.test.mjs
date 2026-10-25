// SVG toolkit phase S2 (#431): bounds. Exact world boxes for every node type through transforms, group unions, the oriented box, the text estimate and
// callback, the selection union, hostile input. Pure, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/svg/matrix.js';
import { fromJson } from '../js/svg/model.js';
import { worldBounds, orientedBox, selectionBounds, nodeBounds, textBox, union } from '../js/svg/bounds.js';

const near = (a, b, msg) => { for (const k of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${msg}: ${k} ${a[k]} != ${b[k]}`); };
const doc = children => { const r = fromJson({ width: 200, height: 200, seq: 50, root: { id: 's1', type: 'g', attrs: {}, children } }); assert.deepEqual(r.problems, []); return r.doc; };

test('leaf boxes: rect, line, polygon, ellipse, path (exact curve extrema, not the control box)', () => {
    const d = doc([
        { id: 's2', type: 'rect', attrs: { x: 10, y: 20, width: 30, height: 40 } },
        { id: 's3', type: 'line', attrs: { x1: 5, y1: 50, x2: -5, y2: 10 } },
        { id: 's4', type: 'polygon', attrs: { points: [0, 0, 10, 5, 4, 12] } },
        { id: 's5', type: 'ellipse', attrs: { cx: 50, cy: 50, rx: 10, ry: 5 } },
        { id: 's6', type: 'path', attrs: { d: [['M', 0, 0], ['C', 0, 10, 10, 10, 10, 0]] } },
    ]);
    near(worldBounds(d, 's2'), { x: 10, y: 20, width: 30, height: 40 }, 'rect');
    near(worldBounds(d, 's3'), { x: -5, y: 10, width: 10, height: 40 }, 'line');
    near(worldBounds(d, 's4'), { x: 0, y: 0, width: 10, height: 12 }, 'polygon');
    near(worldBounds(d, 's5'), { x: 40, y: 45, width: 20, height: 10 }, 'ellipse');
    near(worldBounds(d, 's6'), { x: 0, y: 0, width: 10, height: 7.5 }, 'path');
});

test('transforms: a rotated rect and ellipse give the exact box; a circle keeps its size under any rotation', () => {
    const d = doc([
        { id: 's2', type: 'rect', attrs: { x: 0, y: 0, width: 10, height: 20, transform: M.rotate(90) } },
        { id: 's3', type: 'ellipse', attrs: { cx: 0, cy: 0, rx: 10, ry: 5, transform: M.rotate(90) } },
        { id: 's4', type: 'ellipse', attrs: { cx: 0, cy: 0, rx: 10, ry: 10, transform: M.rotate(45) } },
    ]);
    near(worldBounds(d, 's2'), { x: -20, y: 0, width: 20, height: 10 }, 'rotated rect');
    near(worldBounds(d, 's3'), { x: -5, y: -10, width: 10, height: 20 }, 'rotated ellipse');
    near(worldBounds(d, 's4'), { x: -10, y: -10, width: 20, height: 20 }, 'rotated circle');
});

test('groups: the union of the children through every matrix; an ancestor rotation gives the exact box of the content, not a turned box', () => {
    const d = doc([
        { id: 's2', type: 'g', attrs: { transform: M.translate(100, 0) }, children: [
            { id: 's3', type: 'rect', attrs: { x: 0, y: 0, width: 10, height: 10 } },
            { id: 's4', type: 'g', attrs: { transform: M.scale(2) }, children: [{ id: 's5', type: 'rect', attrs: { x: 5, y: 5, width: 5, height: 5 } }] },
        ] },
        { id: 's6', type: 'g', attrs: { transform: M.rotate(45) }, children: [{ id: 's7', type: 'ellipse', attrs: { cx: 0, cy: 0, rx: 10, ry: 10 } }] },
        { id: 's8', type: 'g', attrs: {}, children: [] },
    ]);
    near(worldBounds(d, 's5'), { x: 110, y: 10, width: 10, height: 10 }, 'nested child');
    near(worldBounds(d, 's2'), { x: 100, y: 0, width: 20, height: 20 }, 'group');
    near(worldBounds(d, 's7'), { x: -10, y: -10, width: 20, height: 20 }, 'circle under a rotated group');
    assert.equal(worldBounds(d, 's8'), null, 'an empty group draws nothing');
    near(worldBounds(d, 's1'), { x: -10, y: -10, width: 130, height: 30 }, 'root');
});

test('the cached box is reused for the same node object and is right again after an edit (a new object)', () => {
    const d = doc([{ id: 's2', type: 'rect', attrs: { x: 0, y: 0, width: 10, height: 10 } }]);
    const a = worldBounds(d, 's2'), b = worldBounds(d, 's2');
    assert.deepEqual(a, b);
    const e = doc([{ id: 's2', type: 'rect', attrs: { x: 5, y: 0, width: 10, height: 10 } }]);
    near(worldBounds(e, 's2'), { x: 5, y: 0, width: 10, height: 10 }, 'edited');
});

test('oriented box: own-space corners turned into document space, with the matrix', () => {
    const d = doc([{ id: 's2', type: 'g', attrs: { transform: M.translate(5, 5) }, children: [{ id: 's3', type: 'rect', attrs: { x: 0, y: 0, width: 10, height: 20, transform: M.rotate(90) } }] }]);
    const o = orientedBox(d, 's3');
    assert.deepEqual(o.corners, [[5, 5], [5, 15], [-15, 15], [-15, 5]]);
    assert.deepEqual(o.matrix, M.multiply(M.translate(5, 5), M.rotate(90)));
    assert.equal(orientedBox(d, 'nope'), null);
});

test('text: an estimate by anchor and font size, or the caller measures it', () => {
    const n = { id: 's2', type: 'text', attrs: { x: 100, y: 50, 'font-size': 10, 'text-anchor': 'middle' }, text: 'abcd' };
    near(textBox(n), { x: 88, y: 42, width: 24, height: 10 }, 'estimate');
    assert.equal(textBox({ ...n, text: '' }), null);
    const d = doc([n]);
    near(worldBounds(d, 's2', { text: () => ({ x: 0, y: 0, width: 7, height: 3 }) }), { x: 0, y: 0, width: 7, height: 3 }, 'measured');
});

test('selection: the union of the world boxes, unknown ids and duplicates skipped; hostile input gives null, never throws', () => {
    const d = doc([{ id: 's2', type: 'rect', attrs: { x: 0, y: 0, width: 10, height: 10 } }, { id: 's3', type: 'rect', attrs: { x: 20, y: 30, width: 5, height: 5 } }]);
    near(selectionBounds(d, ['s2', 's3', 's2', 'nope']), { x: 0, y: 0, width: 25, height: 35 }, 'union');
    assert.equal(selectionBounds(d, []), null);
    near(selectionBounds(d, 's3'), { x: 20, y: 30, width: 5, height: 5 }, 'one id');
    for (const bad of [null, {}, { root: null }]) assert.equal(worldBounds(bad, 's2'), null);
    assert.equal(nodeBounds(null), null);
    assert.equal(nodeBounds({ type: 'image', attrs: {} }), null);
    assert.equal(union(null, null), null);
});
