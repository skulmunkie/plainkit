// SVG toolkit phase S4 (#431): snap targets for pk-canvas. World rects of every shape not moved, the page first, groups opened, exclusions. Pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/svg/matrix.js';
import { fromJson } from '../js/svg/model.js';
import { snapTargets } from '../js/svg/snap.js';

const doc = children => { const r = fromJson({ width: 100, height: 80, seq: 5000, root: { id: 's1', type: 'g', attrs: {}, children } }); assert.deepEqual(r.problems, []); return r.doc; };
const d = doc([
    { id: 's2', type: 'rect', attrs: { x: 0, y: 0, width: 10, height: 10 } },
    { id: 's3', type: 'g', attrs: { transform: M.translate(50, 0) }, children: [
        { id: 's4', type: 'rect', attrs: { x: 0, y: 0, width: 5, height: 5 } },
        { id: 's5', type: 'ellipse', attrs: { cx: 0, cy: 0, rx: 2, ry: 2 } },
    ] },
    { id: 's6', type: 'g', attrs: {}, children: [] },
    { id: 's7', type: 'text', attrs: { x: 0, y: 50 }, text: '' },
]);

test('the page first, then every shape in document order as a canvas rect; groups are opened through their transform', () => {
    assert.deepEqual(snapTargets(d), [
        { id: 'page', x: 0, y: 0, w: 100, h: 80 },
        { id: 's2', x: 0, y: 0, w: 10, h: 10 },
        { id: 's4', x: 50, y: 0, w: 5, h: 5 },
        { id: 's5', x: 48, y: -2, w: 4, h: 4 },
    ]);
});

test('exclude takes nodes (a group with its subtree) out; page false leaves the page out', () => {
    assert.deepEqual(snapTargets(d, { exclude: ['s3'] }).map(t => t.id), ['page', 's2']);
    assert.deepEqual(snapTargets(d, { exclude: 's2', page: false }).map(t => t.id), ['s4', 's5']);
    assert.deepEqual(snapTargets(d, { exclude: ['s1'] }).map(t => t.id), ['page'], 'excluding the root leaves only the page');
});

test('text is measured by the caller when a callback is given', () => {
    const t = doc([{ id: 's2', type: 'text', attrs: { x: 10, y: 20 }, text: 'Hi' }]);
    assert.deepEqual(snapTargets(t, { page: false, text: () => ({ x: 10, y: 10, width: 8, height: 10 }) }), [{ id: 's2', x: 10, y: 10, w: 8, h: 10 }]);
});

test('linear over thousands of shapes, and hostile input gives an empty list', () => {
    const many = doc(Array.from({ length: 2000 }, (_, i) => ({ id: `s${i + 2}`, type: 'rect', attrs: { x: i, y: 0, width: 1, height: 1 } })));
    assert.equal(snapTargets(many).length, 2001);
    for (const bad of [null, {}, { root: null }]) assert.deepEqual(snapTargets(bad), []);
});
