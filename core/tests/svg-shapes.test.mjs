// SVG toolkit phase S2 (#431): shape generators. The geometry of each shape, specs that insert cleanly into a document, and refusals. Pure, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSvgDoc, validateDoc, findNode } from '../js/svg/model.js';
import { insert } from '../js/svg/ops.js';
import { bounds } from '../js/svg/path-geom.js';
import { regularPolygon, star, roundedRect, arc, grid } from '../js/svg/shapes.js';

const close = (a, b, msg) => { assert.equal(a.length, b.length, msg); a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${msg}[${i}]: ${v} != ${b[i]}`)); };
const H = 10 * 4 / 3 * Math.tan(Math.PI / 8);      // the control distance of a quarter circle of radius 10

test('regular polygon: corners on the circle, the first straight up, exact for a square', () => {
    assert.deepEqual(regularPolygon({ r: 10, sides: 4 }).attrs.points, [0, -10, 10, 0, 0, 10, -10, 0]);
    const hex = regularPolygon({ cx: 5, cy: 5, r: 3 }).attrs.points;
    assert.equal(hex.length, 12);
    for (let k = 0; k < 12; k += 2) assert.ok(Math.abs(Math.hypot(hex[k] - 5, hex[k + 1] - 5) - 3) < 1e-9);
    assert.deepEqual(regularPolygon({ r: 10, sides: 4, rotation: 45 }).attrs.points.slice(0, 2).map(v => Math.round(v * 1000) / 1000), [7.071, -7.071]);
});

test('star: alternating outer and inner corners, first tip straight up', () => {
    const p = star({ outer: 10, inner: 5, arms: 4 }).attrs.points;
    assert.equal(p.length, 16);
    assert.deepEqual(p.slice(0, 2), [0, -10]);
    for (let k = 0; k < 16; k += 2) assert.ok(Math.abs(Math.hypot(p[k], p[k + 1]) - (k % 4 === 0 ? 10 : 5)) < 1e-9, `corner ${k / 2}`);
    assert.equal(star({ outer: 8 }).attrs.points.length, 20, 'five arms by default');
});

test('rounded rect: the radius is capped at half the shorter side; 0 gives a plain rect', () => {
    assert.deepEqual(roundedRect({ width: 10, height: 4, r: 3 }), { type: 'rect', attrs: { x: 0, y: 0, width: 10, height: 4, rx: 2, ry: 2 } });
    assert.deepEqual(roundedRect({ x: 1, y: 2, width: 10, height: 4 }).attrs, { x: 1, y: 2, width: 10, height: 4 });
});

test('arc: a quarter turn is one exact cubic; a full turn closes; a pie goes through the centre; the other way round works', () => {
    const q = arc({ r: 10 }).attrs.d;
    assert.deepEqual(q[0], ['M', 10, 0]);
    assert.equal(q.length, 2); assert.equal(q[1][0], 'C');
    close(q[1].slice(1), [10, H, H, 10, 0, 10], 'quarter');
    const full = arc({ cx: 50, cy: 50, r: 10, end: 360 }).attrs.d;
    assert.equal(full.length, 6); assert.deepEqual(full.at(-1), ['Z']); assert.deepEqual(full[4].slice(-2), [60, 50]);
    const b = bounds(full);
    close([b.x, b.y, b.width, b.height], [40, 40, 20, 20], 'circle bounds');
    const pie = arc({ r: 10, start: 0, end: 90, pie: true }).attrs.d;
    assert.deepEqual(pie.slice(-2), [['L', 0, 0], ['Z']]);
    const back = arc({ r: 10, start: 90, end: 0 }).attrs.d;
    assert.deepEqual(back[0], ['M', 0, 10]);
    close(back[1].slice(1), [H, 10, 10, H, 10, 0], 'counter-clockwise');
    assert.equal(arc({ r: 10, start: 0, end: 200 }).attrs.d.length, 4, 'three pieces for 200 degrees');
});

test('grid: cols + 1 vertical and rows + 1 horizontal lines', () => {
    assert.deepEqual(grid({ width: 20, height: 10, cols: 2, rows: 1 }).attrs.d, [
        ['M', 0, 0], ['L', 0, 10], ['M', 10, 0], ['L', 10, 10], ['M', 20, 0], ['L', 20, 10],
        ['M', 0, 0], ['L', 20, 0], ['M', 0, 10], ['L', 20, 10],
    ]);
});

test('every spec inserts into a document with no problems and keeps it valid', () => {
    let doc = createSvgDoc({ width: 200, height: 200 });
    for (const spec of [regularPolygon({ r: 10 }), star({ cx: 50, cy: 50, outer: 20 }), roundedRect({ width: 30, height: 20, r: 4 }), arc({ r: 10, end: 270, pie: true }), grid({ width: 100, height: 100, cols: 10, rows: 10 }), regularPolygon({ r: 5, sides: 1000 })]) {
        const r = insert(doc, spec);
        assert.deepEqual(r.problems, [], JSON.stringify(spec).slice(0, 60));
        assert.equal(findNode(r.doc, r.ids[0]).type, spec.type);
        doc = r.doc;
    }
    assert.deepEqual(validateDoc(doc), []);
});

test('refusals: null for input that cannot make the shape, never a throw', () => {
    for (const bad of [
        regularPolygon(), regularPolygon({ r: 10, sides: 2 }), regularPolygon({ r: 10, sides: 1001 }), regularPolygon({ r: 10, sides: 4.5 }), regularPolygon({ r: -1 }), regularPolygon({ r: NaN }),
        star({ outer: 10, inner: 0 }), star({ outer: 10, arms: 2 }), star({ outer: Infinity }),
        roundedRect({ width: 0, height: 5 }), roundedRect({ width: 5, height: 5, r: -1 }),
        arc({ r: 0 }), arc({ r: 10, start: 30, end: 30 }), arc({ r: 10, end: NaN }),
        grid({ width: 10, height: 10, cols: 0 }), grid({ width: 10, height: 10, rows: 1001 }), grid({ width: -1, height: 10 }),
    ]) assert.equal(bad, null);
});
