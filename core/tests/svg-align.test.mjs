// SVG toolkit phase S4 (#431): alignment and distribution plans and applying them. Pure, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/svg/matrix.js';
import { fromJson, validateDoc } from '../js/svg/model.js';
import { worldBounds } from '../js/svg/bounds.js';
import { alignPlan, distributePlan, applyPlan, movable } from '../js/svg/align.js';

const doc = children => { const r = fromJson({ width: 100, height: 100, seq: 50, root: { id: 's1', type: 'g', attrs: {}, children } }); assert.deepEqual(r.problems, []); return r.doc; };
const rect = (id, x, y, width, height, extra = {}) => ({ id, type: 'rect', attrs: { x, y, width, height, ...extra } });
const box = (d, id) => worldBounds(d, id);
const ids3 = ['s2', 's3', 's4'];
const three = () => doc([rect('s2', 10, 0, 10, 10), rect('s3', 30, 20, 20, 30), rect('s4', 5, 60, 5, 5)]);

test('align start, centre, end on x, within the selection', () => {
    const d = three();
    assert.deepEqual(alignPlan(d, ids3, { axis: 'x', to: 'start' }), [{ id: 's2', dx: -5, dy: 0 }, { id: 's3', dx: -25, dy: 0 }]);
    let r = applyPlan(d, alignPlan(d, ids3, { axis: 'x', to: 'start' }));
    assert.ok(r.changed); assert.deepEqual(r.ids, ['s2', 's3']); assert.deepEqual(validateDoc(r.doc), []);
    assert.deepEqual(ids3.map(id => box(r.doc, id).x), [5, 5, 5]);
    r = applyPlan(d, alignPlan(d, ids3, { axis: 'x', to: 'center' }));
    for (const id of ids3) { const b = box(r.doc, id); assert.ok(Math.abs(b.x + b.width / 2 - 27.5) < 1e-9, id); }
    r = applyPlan(d, alignPlan(d, ids3, { axis: 'x', to: 'end' }));
    for (const id of ids3) { const b = box(r.doc, id); assert.ok(Math.abs(b.x + b.width - 50) < 1e-9, id); }
});

test('align on y within the page puts the bottoms on the page edge', () => {
    const d = three(), r = applyPlan(d, alignPlan(d, ids3, { axis: 'y', to: 'end', within: 'page' }));
    for (const id of ids3) { const b = box(r.doc, id); assert.ok(Math.abs(b.y + b.height - 100) < 1e-9, id); }
    assert.equal(box(r.doc, 's2').x, 10, 'x untouched');
});

test('a node inside a scaled group moves by the right amount on the page; a selected group carries its selected child', () => {
    const d = doc([rect('s2', 10, 0, 10, 10), { id: 's5', type: 'g', attrs: { transform: M.scale(2) }, children: [rect('s6', 10, 10, 5, 5)] }]);
    assert.deepEqual(box(d, 's6'), { x: 20, y: 20, width: 10, height: 10 });
    const r = applyPlan(d, alignPlan(d, ['s2', 's6'], { axis: 'x', to: 'start' }));
    assert.equal(box(r.doc, 's6').x, 10);
    assert.deepEqual(movable(d, ['s5', 's6']).map(i => i.id), ['s5'], 'the child is moved through its group only');
});

test('distribute by gap and by centre: first and last stay, the middle moves', () => {
    const d = doc([rect('s2', 0, 0, 10, 10), rect('s3', 15, 0, 5, 10), rect('s4', 50, 0, 20, 10)]);
    assert.deepEqual(distributePlan(d, ids3, { axis: 'x', by: 'gap' }), [{ id: 's3', dx: 12.5, dy: 0 }]);
    const g = applyPlan(d, distributePlan(d, ids3, { axis: 'x' })).doc, [a, b, c] = ids3.map(id => box(g, id));
    assert.ok(Math.abs((b.x - (a.x + a.width)) - (c.x - (b.x + b.width))) < 0.01, 'equal gaps');
    assert.deepEqual(distributePlan(d, ids3, { axis: 'x', by: 'center' }), [{ id: 's3', dx: 15, dy: 0 }]);
    assert.deepEqual(distributePlan(d, ['s2', 's3'], { axis: 'x' }), [], 'fewer than three: nothing');
});

test('hostile input: empty plans, unknown ids reported, the root never moves, nothing throws', () => {
    const d = three();
    assert.deepEqual(alignPlan(d, ['s1', 'nope'], { axis: 'x' }), []);
    assert.deepEqual(alignPlan(d, ids3, { axis: 'z' }), []);
    assert.deepEqual(alignPlan(d, ids3, { to: 'middle' }), []);
    assert.deepEqual(distributePlan(d, ids3, { by: 'size' }), []);
    assert.deepEqual(alignPlan(null, ids3), []);
    const r = applyPlan(d, [{ id: 'nope', dx: 1, dy: 0 }, { id: 's2', dx: NaN, dy: 0 }, null]);
    assert.equal(r.changed, false); assert.equal(r.doc, d); assert.equal(r.problems[0].code, 'unknown-id');
    assert.deepEqual(applyPlan(d, 'x').ids, []);
});
