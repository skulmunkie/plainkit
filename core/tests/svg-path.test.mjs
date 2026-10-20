// SVG toolkit phase S3 (#431): path data. parsePath / toD (the whole `d` grammar to the model's absolute M/L/C/Z and back) and the geometry on segments
// (bounds, transform, reverse, flatten, length, pointAt, simplify). Pure, no DOM; includes a hostile corpus and seeded property tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePath, toD, arcToCubics } from '../js/svg/path.js';
import * as G from '../js/svg/path-geom.js';
import * as M from '../js/svg/matrix.js';
import { cleanValue, LIMITS } from '../js/svg/allow.js';
import { createSvgDoc, createNode, validateDoc, toJson, fromJson } from '../js/svg/model.js';

const parse = d => parsePath(d).segments;
const near = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const nearAll = (a, b, eps = 1e-6) => { assert.equal(a.length, b.length, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`); a.forEach((v, i) => near(v, b[i], eps, 'at ' + i)); };
function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
const bez = (p, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]); };

// ---------------------------------------------------------------- parsing

test('parse: every command, absolute and relative, becomes absolute M/L/C/Z', () => {
    assert.deepEqual(parse('M10 10 L20 10 L20 20 Z'), [['M', 10, 10], ['L', 20, 10], ['L', 20, 20], ['Z']]);
    assert.deepEqual(parse('m10 10 l10 0 l0 10 z'), [['M', 10, 10], ['L', 20, 10], ['L', 20, 20], ['Z']]);
    assert.deepEqual(parse('M1 2 H5 V9 h-1 v-2'), [['M', 1, 2], ['L', 5, 2], ['L', 5, 9], ['L', 4, 9], ['L', 4, 7]]);
    assert.deepEqual(parse('M0 0 C1 2 3 4 5 6 c1 1 2 2 3 3'), [['M', 0, 0], ['C', 1, 2, 3, 4, 5, 6], ['C', 6, 7, 7, 8, 8, 9]]);
    assert.deepEqual(parse('M0 0 c1 1 2 2 3 3'), [['M', 0, 0], ['C', 1, 1, 2, 2, 3, 3]], 'a relative first moveto is absolute');
    assert.deepEqual(parse('m5 5'), [], 'a moveto alone draws nothing');
});

test('parse: implicit repeats, separators, compact numbers', () => {
    assert.deepEqual(parse('M0 0 10 10 20 0'), [['M', 0, 0], ['L', 10, 10], ['L', 20, 0]], 'extra pairs after M are lineto');
    assert.deepEqual(parse('m0 0 10 10 10 0'), [['M', 0, 0], ['L', 10, 10], ['L', 20, 10]], 'and relative after m');
    assert.deepEqual(parse('M0,0,L10,10'.replace(',L', 'L')), [['M', 0, 0], ['L', 10, 10]]);
    assert.deepEqual(parse('M 0 0 L 1 , 2 , 3 , 4'), [['M', 0, 0], ['L', 1, 2], ['L', 3, 4]]);
    assert.deepEqual(parse('M1-2L.5.5'), [['M', 1, -2], ['L', 0.5, 0.5]]);
    assert.deepEqual(parse('M1e2-2.5e-1L+1 +2'), [['M', 100, -0.25], ['L', 1, 2]]);
    assert.deepEqual(parse('\n\tM0\r\n0\fL1 1 '), [['M', 0, 0], ['L', 1, 1]]);
    assert.deepEqual(parse('M0 0Z'), [['M', 0, 0], ['Z']]);
    assert.deepEqual(parse('M0 0 L5 0 z z Z'), [['M', 0, 0], ['L', 5, 0], ['Z']], 'repeated closes collapse');
    assert.deepEqual(parse('M0 0 L5 0 Z L5 5'), [['M', 0, 0], ['L', 5, 0], ['Z'], ['M', 0, 0], ['L', 5, 5]], 'drawing after Z starts at the subpath start');
    assert.deepEqual(parse('M2 2 L5 0 z m1 1 l1 1'), [['M', 2, 2], ['L', 5, 0], ['Z'], ['M', 3, 3], ['L', 4, 4]], 'm after z is relative to the start point');
});

test('parse: smooth curves reflect the previous control point, Q and T elevate to cubics', () => {
    const s = parse('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    assert.deepEqual(s[2], ['C', 10, -10, 20, -10, 20, 0]);
    assert.deepEqual(parse('M0 0 S5 5 10 0')[1], ['C', 0, 0, 5, 5, 10, 0], 'S without a previous curve starts at the current point');
    assert.deepEqual(parse('M0 0 L5 5 S9 9 10 0')[2], ['C', 5, 5, 9, 9, 10, 0], 'a line before S resets');
    const q = parse('M0 0 Q10 10 20 0 T40 0');
    // the quadratic (0,0) (10,10) (20,0) at t = 0.5 is (10, 5): the cubic matches at every t
    const p = [[0, 0], [q[1][1], q[1][2]], [q[1][3], q[1][4]], [20, 0]];
    nearAll(bez(p, 0.5), [10, 5]); nearAll(bez(p, 0.25), [5, 3.75]);
    nearAll(q[2].slice(1, 3), [20 + 2 / 3 * (30 - 20), 0 + 2 / 3 * (-10 - 0)], 1e-9);        // T reflects (10,10) about (20,0) = (30,-10)
    assert.deepEqual(parse('M0 0 T10 0')[1].slice(1, 3), [0, 0], 'T without a previous quadratic is a line-like curve');
    assert.deepEqual(parse('M0 0 C1 1 2 2 3 3 T9 9')[2].slice(1, 3), [3, 3], 'T after C does not reflect a cubic control point');
});

test('parse: arcs become quarter-turn cubics on the right circle; degenerate arcs', () => {
    const half = parse('M0 0 A10 10 0 0 1 20 0');
    assert.equal(half.length, 3, 'a half circle is two quarter pieces');
    nearAll(half[2].slice(5), [20, 0]);
    for (let t = 0; t <= 1; t += 0.1) {                                  // every sampled point is 10 from the centre (10, 0) on the upper side of y
        const seg = half[1], p0 = [0, 0], pts = [p0, [seg[1], seg[2]], [seg[3], seg[4]], [seg[5], seg[6]]];
        const [x, y] = bez(pts, t);
        near(Math.hypot(x - 10, y), 10, 5e-3, 'on the circle');
        assert.ok(y <= 1e-9, 'sweep 1 from left to right goes through negative y');
    }
    assert.equal(parse('M0 0 A10 10 0 0 0 20 0')[1][2] >= 0, true, 'sweep 0 goes the other way');
    assert.equal(parse('M0 0 A10 10 0 1 1 20 0 A10 10 0 1 1 0 0').length, 1 + 2 + 2, 'two half circles');
    assert.deepEqual(parse('M0 0 A0 5 0 0 1 10 10'), [['M', 0, 0], ['L', 10, 10]], 'a zero radius is a line');
    assert.deepEqual(parse('M3 3 A5 5 0 0 1 3 3'), [], 'an arc to the same point is omitted (and the trailing moveto drops)');
    const tiny = parse('M0 0 A1 1 0 0 1 100 0');                              // radii too small are scaled up to fit
    nearAll(tiny.at(-1).slice(5), [100, 0]);
    assert.equal(arcToCubics(0, 0, 0, 0, 0, false, false, 1, 1), null);
    assert.deepEqual(arcToCubics(1, 1, 5, 5, 0, false, false, 1, 1), []);
    assert.deepEqual(parse('M0 0 a1 1 0 00.5.5'), parse('M0 0 a1 1 0 0 0 .5 .5'), 'arc flags may be written without separators');
    assert.deepEqual(parse('M0 0 a1,1,0,1,1,2,0'), parse('M0 0 a1 1 0 1 1 2 0'));
    assert.equal(parsePath('M0 0 a1 1 0 2 0 1 1').problems.length, 1, 'a flag is 0 or 1');
    // a rotated ellipse arc ends where it was told to
    nearAll(parse('M0 0 a20 10 30 1 0 15 5').at(-1).slice(5), [15, 5], 1e-9);
});

test('parse: errors keep what came before and say where; never throw', () => {
    const cases = {
        'L10 10': 'path-start', 'M0 0 L': 'path-number', 'M0 0 L1': 'path-number', 'M0 0 x': 'path-number', 'M0 0 L1 1 5': 'path-number',
        'M0 0 Z 5 5': 'path-syntax', 'M,0 0': 'path-number', 'M0 0 L,1 1': 'path-number', 'M0 0 L1 1 .': 'path-number', 'M0 0 L1e999 1': 'path-number',
        'M0 0 L1 1 #': 'path-number', 'M0 0 L1 1 L2': 'path-number',
    };
    for (const [d, code] of Object.entries(cases)) {
        const r = parsePath(d);
        assert.ok(r.problems.length === 1 && r.problems[0].code === code && r.problems[0].severity === 'error', `${d}: ${JSON.stringify(r.problems)}`);
        assert.match(r.problems[0].message, /position \d+/);
        assert.equal(cleanValue('d', r.segments)[0] || r.segments.length === 0, true, 'the kept part is always valid for the model');
    }
    assert.deepEqual(parse('M0 0 L10 10 L5'), [['M', 0, 0], ['L', 10, 10]]);
    assert.deepEqual(parsePath('').problems, []); assert.deepEqual(parsePath('  ').segments, []);
    for (const v of [null, undefined, 5, {}, [], ['M', 0, 0]]) assert.equal(parsePath(v).problems[0].code, 'path-type');
});

test('parse: limits (segments, input size, coordinates), tightened but never loosened', () => {
    const many = 'M0 0' + ' L1 1'.repeat(LIMITS.segments + 50);
    const r = parsePath(many);
    assert.equal(r.segments.length, LIMITS.segments); assert.ok(r.problems.some(p => p.code === 'limit-segments')); assert.ok(cleanValue('d', r.segments)[0]);
    assert.equal(parsePath(many, { segments: 5 }).segments.length, 5);
    assert.equal(parsePath(many, { segments: 1e9 }).segments.length, LIMITS.segments);
    const arcs = parsePath('M0 0' + ' A5 5 0 1 1 0.001 0'.repeat(LIMITS.segments));
    assert.ok(arcs.segments.length <= LIMITS.segments);
    assert.equal(parsePath('M0 0 L1 1 ' + ' '.repeat(LIMITS.input)).problems[0].code, 'path-size');
    assert.equal(parsePath('M0 0 L1 1 ', { input: 5 }).problems[0].code, 'path-size');
    const big = parse('M0 0 L9999999999 -9999999999 l9e9 9e9');
    assert.deepEqual(big, [['M', 0, 0], ['L', LIMITS.coord, -LIMITS.coord], ['L', LIMITS.coord, LIMITS.coord]]);
    assert.ok(cleanValue('d', parse('M1e300 1e300 C1e300 1e300 -1e300 0 1e300 1e300 A1e300 1e300 0 0 1 -1e300 5'))[0]);
});

test('parse: hostile corpus (markup, script, huge and malformed numbers, control characters, deep repetition) yields valid segments or nothing', () => {
    const JS = 'java' + 'script:';
    const corpus = ['<script>alert(1)</script>', JS + 'alert(1)', 'M0 0 L1 1</path><script>', 'M0 0 L1 1" onload="x', 'M0 0\u0000L1 1', 'M‮0 0', 'M0 0 L٣ ٤', 'M0 0 L1 1 ' + 'z'.repeat(1e5),
        'M' + '9'.repeat(5000) + ' 0 L1 1', 'M0 0 L' + '0.'.repeat(5000), 'M0 0 L1' + 'e'.repeat(1e4), 'M0 0 ' + 'M'.repeat(1e4), 'M0 0 L-' + '-'.repeat(1e4), 'M NaN Infinity', 'M0 0 L1_000 1',
        'M0 0 L0x10 1', 'M0 0 L1 1;stroke:red', 'm'.repeat(1e5), ',,,,', 'M0 0 ' + 'a1 1 0 11 1 1 '.repeat(2000), 'M0 0 ' + ' ,'.repeat(1e4), '\u0000', 'M1 1' + ' '.repeat(1e5) + 'L2 2', '__proto__', 'M0 0 L 1 1'.repeat(10)];
    for (const d of corpus) {
        let r;
        assert.doesNotThrow(() => { r = parsePath(d); }, d.slice(0, 30));
        assert.ok(r.segments.length === 0 || cleanValue('d', r.segments)[0], d.slice(0, 30));
        assert.ok(r.segments.length <= LIMITS.segments);
        assert.match(toD(r.segments), /^[MLCZ0-9. \-]*$/, 'the output has only path characters');
    }
    const t0 = performance.now();
    parsePath('M0 0' + ' L1 1'.repeat(LIMITS.segments));
    assert.ok(performance.now() - t0 < 500, 'linear time');
});

// ---------------------------------------------------------------- writing

test('toD: short, deterministic, rounded, safe; invalid input gives an empty string', () => {
    assert.equal(toD([['M', 10, 20], ['L', 30, -40], ['C', 1, 2, 3, 4, 5.55555, -6], ['Z']]), 'M10 20L30-40C1 2 3 4 5.556-6Z');
    assert.equal(toD([['M', 0.0004, -0.0004], ['L', 1.5, 2]], { precision: 0 }), 'M0 0L2 2');
    assert.equal(toD([['M', 1.23456, 0], ['L', 1, 1]], { precision: 2 }), 'M1.23 0L1 1');
    assert.equal(toD([['M', 1, 1], ['L', 2, 2]], { precision: 99 }), 'M1 1L2 2');
    assert.equal(toD([['M', 1, 1], ['L', 2, 2]], { precision: -1 }), 'M1 1L2 2');
    for (const bad of [[], null, 'M0 0', [['L', 1, 1]], [['M', 1]], [['M', NaN, 0]], [['M', 0, 0], ['Q', 1, 1, 2, 2]], [['M', 0, 0], ['L', Infinity, 0]], {}, [['M', 0, 0], 'L']]) assert.equal(toD(bad), '');
    assert.equal(toD([['M', 1e300, -1e300], ['L', 0, 0]]), `M${LIMITS.coord} -${LIMITS.coord}L0 0`.replace(' -', '-'));
});

test('round trip: toD then parse gives the same segments, and the text is a fixed point (seeded)', () => {
    const rnd = rng(7);
    const c = () => Math.round((rnd() * 2000 - 1000) * 1000) / 1000;
    for (let n = 0; n < 300; n++) {
        const segs = [];
        for (let sp = 0, k = 1 + Math.floor(rnd() * 3); sp < k; sp++) {          // subpaths: M, one or more L/C, an optional Z
            segs.push(['M', c(), c()]);
            for (let i = 0, m = 1 + Math.floor(rnd() * 6); i < m; i++) segs.push(rnd() < 0.5 ? ['L', c(), c()] : ['C', c(), c(), c(), c(), c(), c()]);
            if (rnd() < 0.5) segs.push(['Z']);
        }
        const text = toD(segs);
        assert.deepEqual(parse(text), segs, text);
        assert.equal(toD(parse(text)), text, 'fixed point');
        assert.equal(toD(parse(text), { precision: 3 }), toD(segs), 'deterministic');
    }
});

test('parse then toD then the model: a path node carries parsed data and the document stays valid and round trips', () => {
    const d = 'M10 10 h20 v20 a5 5 0 0 1 10 0 q5 5 10 0 t10 0 s2 2 4 4 z m5 5 l1 1';
    const doc = createSvgDoc({ width: 100, height: 100 });
    const { doc: seeded, node, problems } = createNode(doc, { type: 'path', attrs: { d: parse(d), fill: 'none' } });
    assert.deepEqual(problems, []);
    const full = { ...seeded, root: { ...doc.root, children: [node] } };
    assert.deepEqual(validateDoc(full), []);
    assert.equal(fromJson(toJson(full)).problems.length, 0);
    assert.equal(toD(node.attrs.d), toD(parse(toD(node.attrs.d))));
});

// ---------------------------------------------------------------- geometry

test('bounds: exact curve extrema, not the control box; closed and open; lone moveto ignored', () => {
    assert.deepEqual(G.bounds(parse('M0 0 L10 5 L-4 20')), { x: -4, y: 0, width: 14, height: 20 });
    const arch = parse('M0 0 C0 100 100 100 100 0');                           // control box height 100, the curve peaks at 75
    const b = G.bounds(arch);
    near(b.y, 0); near(b.height, 75, 1e-9); near(b.width, 100, 1e-9);
    const circle = G.bounds(parse('M0 0 A10 10 0 1 1 20 0 A10 10 0 1 1 0 0Z'));
    near(circle.x, 0, 1e-3); near(circle.width, 20, 1e-3); near(circle.height, 20, 1e-3); near(circle.y, -10, 1e-3);
    assert.equal(G.bounds([]), null); assert.equal(G.bounds(null), null); assert.equal(G.bounds([['L', 1, 1]]), null);
    assert.deepEqual(G.bounds([['M', 5, 5], ['L', 6, 7], ['M', 100, 100]]), { x: 5, y: 5, width: 1, height: 2 }, 'a trailing lone moveto adds nothing');
    assert.deepEqual(G.bounds(parse('M3 4 L3 4')), { x: 3, y: 4, width: 0, height: 0 });
});

test('bounds: equals a dense sample of the curve (seeded random cubics, within 1e-3 and never smaller than the sampled box)', () => {
    const rnd = rng(11), r = () => rnd() * 200 - 100;
    for (let n = 0; n < 200; n++) {
        const segs = [['M', r(), r()], ['C', r(), r(), r(), r(), r(), r()], ['C', r(), r(), r(), r(), r(), r()]];
        const b = G.bounds(segs);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, p = [segs[0][1], segs[0][2]];
        for (const s of segs.slice(1)) {
            const pts = [p, [s[1], s[2]], [s[3], s[4]], [s[5], s[6]]];
            for (let k = 0; k <= 2000; k++) { const [x, y] = bez(pts, k / 2000); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
            p = pts[3];
        }
        near(b.x, x0, 1e-2); near(b.y, y0, 1e-2); near(b.x + b.width, x1, 1e-2); near(b.y + b.height, y1, 1e-2);
        assert.ok(b.x <= x0 + 1e-9 && b.y <= y0 + 1e-9 && b.x + b.width >= x1 - 1e-9 && b.y + b.height >= y1 - 1e-9, 'exact extrema enclose every sample');
    }
});

test('transform: points go through the matrix, structure and Z kept, clamped, bad input gives []', () => {
    const segs = parse('M0 0 L10 0 C10 5 5 10 0 10 Z');
    const t = G.transform(segs, M.translate(5, -5));
    assert.deepEqual(t, [['M', 5, -5], ['L', 15, -5], ['C', 15, 0, 10, 5, 5, 5], ['Z']]);
    assert.deepEqual(segs[1], ['L', 10, 0], 'the input is not touched');
    const r = G.transform(segs, M.rotate(90));
    nearAll(r[1].slice(1), [0, 10], 1e-9);
    const s = G.bounds(G.transform(segs, M.multiply(M.translate(3, 4), M.scale(2, 3)))), o = G.bounds(segs);
    near(s.width, o.width * 2, 1e-9); near(s.height, o.height * 3, 1e-9); near(s.x, o.x * 2 + 3, 1e-9);
    assert.equal(G.transform(segs, M.translate(1e300, 0))[0][1], LIMITS.coord);
    for (const bad of [null, [1, 2], [1, 2, 3, 4, 5, NaN], 'x']) assert.deepEqual(G.transform(segs, bad), []);
    assert.deepEqual(G.transform(null, M.IDENTITY), []);
    // a rotated shape's bounds contain the rotated sample points (curves stay curves)
    const rot = M.rotate(37, 5, 5), tb = G.bounds(G.transform(segs, rot));
    for (let k = 0; k <= 50; k++) { const [x, y] = M.apply(rot, ...bez([[10, 0], [10, 5], [5, 10], [0, 10]], k / 50)); assert.ok(x >= tb.x - 1e-9 && x <= tb.x + tb.width + 1e-9 && y >= tb.y - 1e-9 && y <= tb.y + tb.height + 1e-9); }
});

test('reverse: open, closed, curves and several subpaths; reversing twice restores; same shape', () => {
    assert.deepEqual(G.reverse(parse('M0 0 L10 0 L10 10')), [['M', 10, 10], ['L', 10, 0], ['L', 0, 0]]);
    assert.deepEqual(G.reverse(parse('M0 0 C1 2 3 4 5 6')), [['M', 5, 6], ['C', 3, 4, 1, 2, 0, 0]]);
    assert.deepEqual(G.reverse(parse('M0 0 L10 0 L10 10 Z')), [['M', 0, 0], ['L', 10, 10], ['L', 10, 0], ['L', 0, 0], ['Z']],
        'a closed path keeps its start and gains the explicit closing line');
    assert.deepEqual(G.reverse(parse('M0 0 L10 0 L10 10 L0 0 Z')).slice(0, 2), [['M', 0, 0], ['L', 10, 10]]);
    assert.deepEqual(G.reverse(parse('M0 0 L1 1 M5 5 L6 6')), [['M', 1, 1], ['L', 0, 0], ['M', 6, 6], ['L', 5, 5]], 'subpaths keep their order');
    assert.deepEqual(G.reverse([]), []); assert.deepEqual(G.reverse(null), []); assert.deepEqual(G.reverse([['L', 1, 1]]), []);
    const rnd = rng(3), c = () => Math.round(rnd() * 100);
    for (let n = 0; n < 100; n++) {
        const segs = [['M', c(), c()], ['L', c(), c()], ['C', c(), c(), c(), c(), c(), c()], ['L', c(), c()]];
        if (rnd() < 0.5) segs.push(['Z']);
        if (rnd() < 0.5) segs.push(['M', c(), c()], ['C', c(), c(), c(), c(), c(), c()]);
        const once = G.reverse(segs);
        assert.ok(cleanValue('d', once)[0]);
        near(G.length(once, 0.01), G.length(segs, 0.01), 1e-6 * G.length(segs) + 1e-6);
        const bb = G.bounds(segs), rb = G.bounds(once);
        for (const k of ['x', 'y', 'width', 'height']) near(bb[k], rb[k], 1e-9);
        const twice = G.reverse(once);
        near(G.length(twice, 0.01), G.length(segs, 0.01), 1e-6 * G.length(segs) + 1e-6);
    }
    const open = parse('M0 0 L1 1 C2 2 3 3 4 4 L5 5');
    assert.deepEqual(G.reverse(G.reverse(open)), open, 'an open path reverses exactly');
});

test('flatten and length: tolerance respected, closed, circle circumference, errors', () => {
    const circle = parse('M10 0 A10 10 0 1 1 -10 0 A10 10 0 1 1 10 0 Z');
    const fine = G.length(circle, 0.001);
    near(fine, 2 * Math.PI * 10, 0.01);
    const flat = G.flatten(circle, 0.05);
    assert.equal(flat.length, 1); assert.equal(flat[0].closed, true);
    for (let k = 0; k < flat[0].points.length; k += 2) near(Math.hypot(flat[0].points[k], flat[0].points[k + 1]), 10, 0.06, 'vertices lie on the circle');
    const coarse = G.flatten(circle, 5)[0].points.length, finer = G.flatten(circle, 0.01)[0].points.length;
    assert.ok(finer > coarse && coarse >= 8);
    assert.equal(G.length(parse('M0 0 L3 4')), 5); assert.equal(G.length(parse('M0 0 L3 0 L3 4 Z')), 12, 'a closed path includes the closing line');
    assert.equal(G.length(parse('M0 0 L3 0 M10 10 L10 14')), 7);
    for (const tol of [0, -1, NaN, 'x', null, Infinity]) assert.doesNotThrow(() => G.flatten(circle, tol));
    assert.ok(G.flatten(parse('M0 0 C0 1e6 1e6 1e6 1e6 0'), 1e-6)[0].points.length <= 2 + 2 * 256, 'piece count is capped');
    assert.deepEqual(G.flatten(null), []); assert.deepEqual(G.flatten([['M', NaN, 0]]), []); assert.equal(G.length([]), 0);
});

test('pointAt: positions and tangent along open, closed and multi-part paths', () => {
    const p = parse('M0 0 L10 0 L10 10');
    assert.deepEqual(G.pointAt(p, 0), { x: 0, y: 0, angle: 0 });
    assert.deepEqual(G.pointAt(p, 0.25), { x: 5, y: 0, angle: 0 });
    near(G.pointAt(p, 0.75).y, 5); assert.equal(G.pointAt(p, 0.75).angle, 90);
    assert.deepEqual(G.pointAt(p, 1), { x: 10, y: 10, angle: 90 });
    assert.deepEqual(G.pointAt(p, 5), G.pointAt(p, 1)); assert.deepEqual(G.pointAt(p, -5), G.pointAt(p, 0)); assert.deepEqual(G.pointAt(p, NaN), G.pointAt(p, 0));
    const closed = parse('M0 0 L10 0 L10 10 L0 10 Z');
    assert.deepEqual(G.pointAt(closed, 0.875), { x: 0, y: 5, angle: -90 });
    const arc = parse('M10 0 A10 10 0 1 1 -10 0 A10 10 0 1 1 10 0Z');
    const q = G.pointAt(arc, 0.25, 0.001);
    near(q.x, 0, 0.02); near(Math.abs(q.y), 10, 0.02);
    assert.equal(G.pointAt([], 0.5), null); assert.equal(G.pointAt(null, 0.5), null);
    assert.deepEqual(G.pointAt(parse('M3 3 L3 3'), 0.5).x, 3);
});

test('simplify and fromPoints: Douglas-Peucker bound, endpoints kept, hostile input', () => {
    const line = [0, 0, 1, 0.001, 2, 0, 3, -0.001, 4, 0];
    assert.deepEqual(G.simplify(line, 0.01), [0, 0, 4, 0]);
    assert.deepEqual(G.simplify(line, 0.0001), [0, 0, 1, 0.001, 3, -0.001, 4, 0], 'collinear points go even at a tiny tolerance');
    const zig = [0, 0, 5, 3, 10, 0];
    assert.deepEqual(G.simplify(zig, 1), zig); assert.deepEqual(G.simplify(zig, 5), [0, 0, 10, 0]);
    assert.deepEqual(G.simplify([1, 1, 1, 1, 1, 1], 1), [1, 1, 1, 1], 'coincident ends');
    for (const bad of [null, [1], [1, 2, 3], [NaN, 0, 1, 1, 2, 2], 'x']) assert.deepEqual(G.simplify(bad, 1), []);
    assert.deepEqual(G.simplify(zig, 0), zig); assert.deepEqual(G.simplify(zig, -1), zig); assert.deepEqual(G.simplify(zig, NaN), zig);
    const rnd = rng(5), pts = [];
    for (let i = 0; i < 2000; i++) pts.push(i, Math.sin(i / 20) * 50 + rnd());
    const s = G.simplify(pts, 0.5);
    assert.ok(s.length < pts.length / 4); assert.deepEqual(s.slice(0, 2), pts.slice(0, 2)); assert.deepEqual(s.slice(-2), pts.slice(-2));
    for (let k = 0; k < pts.length; k += 2) {                                // every original point lies within tolerance of the simplified polyline
        let best = Infinity;
        for (let j = 2; j < s.length; j += 2) {
            const [ax, ay, bx, by] = [s[j - 2], s[j - 1], s[j], s[j + 1]], len2 = (bx - ax) ** 2 + (by - ay) ** 2;
            const u = len2 ? Math.max(0, Math.min(1, ((pts[k] - ax) * (bx - ax) + (pts[k + 1] - ay) * (by - ay)) / len2)) : 0;
            best = Math.min(best, Math.hypot(pts[k] - (ax + u * (bx - ax)), pts[k + 1] - (ay + u * (by - ay))));
        }
        assert.ok(best <= 0.5 + 1e-9, `point ${k / 2} is ${best} away`);
    }
    assert.deepEqual(G.fromPoints([0, 0, 1, 1, 2, 0]), [['M', 0, 0], ['L', 1, 1], ['L', 2, 0]]);
    assert.deepEqual(G.fromPoints([0, 0, 1, 1], true), [['M', 0, 0], ['L', 1, 1], ['Z']]);
    for (const bad of [null, [0, 0], [0, 0, 1], [0, 0, NaN, 1], 'x']) assert.deepEqual(G.fromPoints(bad), []);
    assert.deepEqual(G.fromPoints([1e300, 0, 0, 0])[0], ['M', LIMITS.coord, 0]);
    assert.ok(cleanValue('d', G.fromPoints(G.simplify(G.flatten(parse('M0 0 C0 50 100 50 100 0'), 0.01)[0].points, 0.1)))[0]);
});

test('geometry never throws on garbage segments', () => {
    const junk = [null, undefined, 5, 'M0 0', {}, [], [null], [[]], [['M']], [['M', 'a', 'b']], [['C', 1, 2]], [['M', 0, 0], ['C', 1, 2, 3, 4, 5]], [['M', 0, 0], ['X', 1, 1]], [['M', Infinity, 0]], [['M', 0, 0], ['L', 1, 1], 5]];
    for (const j of junk) {
        assert.doesNotThrow(() => { G.bounds(j); G.transform(j, M.IDENTITY); G.reverse(j); G.flatten(j); G.length(j); G.pointAt(j, 0.5); toD(j); });
    }
});

test('performance (reported, generous bounds): 10,000 segments parse, write, flatten and measure', () => {
    const text = 'M0 0' + ' C10 20 30 40 50 60'.repeat(LIMITS.segments - 1);
    const t0 = performance.now();
    const { segments } = parsePath(text);
    const back = toD(segments);
    const b = G.bounds(segments), len = G.length(segments, 0.1);
    const t1 = performance.now();
    console.log(`svg path: ${segments.length} segments parse+write+bounds+length ${(t1 - t0).toFixed(0)} ms`);
    assert.equal(segments.length, LIMITS.segments); assert.ok(back.length > 1000 && b && len > 0); assert.ok(t1 - t0 < 3000);
});
