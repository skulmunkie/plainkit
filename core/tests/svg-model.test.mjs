// SVG toolkit phase S1 (#431): matrices, the allow-list, the document model, JSON round trip, limits and a hostile corpus. All pure, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as M from '../js/svg/matrix.js';
import { isPaint, cleanValue, NODES, NODE_TYPES, LIMITS } from '../js/svg/allow.js';
import { createSvgDoc, createNode, normalizeDoc, validateDoc, toJson, fromJson, walk, locate, findNode, stats, ids, equalDocs } from '../js/svg/model.js';

const JS = 'java' + 'script:';
const near =(a, b, eps = 1e-9) => assert.ok(M.equals(a, b, eps), `${a} vs ${b}`);
const rect = (extra = {}) => ({ type: 'rect', attrs: { x: 1, y: 2, width: 3, height: 4, ...extra } });

// ---------------------------------------------------------------- matrices

test('matrix: identity, multiply order, translate/scale/rotate', () => {
    assert.ok(M.isIdentity(M.IDENTITY));
    near(M.multiply(M.IDENTITY, [2, 0, 0, 3, 4, 5]), [2, 0, 0, 3, 4, 5]);
    near(M.multiply(M.translate(10, 0), M.scale(2)), [2, 0, 0, 2, 10, 0]);          // child scale first, then parent translate
    assert.deepEqual(M.apply(M.multiply(M.translate(10, 0), M.scale(2)), 1, 1), [12, 2]);
    assert.deepEqual(M.rotate(90), [0, 1, -1, 0, 0, 0]);                              // exact for quarter turns
    assert.deepEqual(M.apply(M.rotate(90), 1, 0), [0, 1]);
    near(M.rotate(90, 5, 5), [0, 1, -1, 0, 10, 0]);
    near(M.rotate(-90), M.rotate(270));
});

test('matrix: invert round trip and singular matrices', () => {
    const m = M.multiply(M.translate(7, -3), M.multiply(M.rotate(33), M.scale(2, 0.5)));
    near(M.multiply(m, M.invert(m)), M.IDENTITY, 1e-9);
    assert.equal(M.invert([1, 2, 2, 4, 0, 0]), null);
    assert.equal(M.invert(M.scale(0)), null);
    assert.equal(M.decompose(M.scale(0, 1)), null);
});

test('matrix: decompose then compose gives the matrix back (seeded)', () => {
    let s = 12345;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 200; i++) {
        const m = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 100, rnd() * 100];
        const d = M.decompose(m);
        if (!d) continue;
        near(M.compose(d), m, 1e-9);
    }
    const d = M.decompose(M.multiply(M.translate(3, 4), M.multiply(M.rotate(30), M.scale(2, 3))));
    assert.ok(Math.abs(d.rotation - 30) < 1e-9 && Math.abs(d.sx - 2) < 1e-9 && Math.abs(d.sy - 3) < 1e-9 && Math.abs(d.skew) < 1e-9);
});

test('matrix: transform text is short, rounded and deterministic', () => {
    assert.equal(M.toTransform(M.IDENTITY), '');
    assert.equal(M.toTransform(M.translate(10, 0)), 'translate(10)');
    assert.equal(M.toTransform(M.translate(10, 5.5)), 'translate(10 5.5)');
    assert.equal(M.toTransform(M.scale(2)), 'scale(2)');
    assert.equal(M.toTransform(M.scale(2, 3)), 'scale(2 3)');
    assert.equal(M.toTransform([1, 0, 0, 1, 0.0004, 0]), '');
    assert.equal(M.toTransform(M.rotate(90)), 'matrix(0 1 -1 0 0 0)');
    assert.equal(M.fmt(-0.0001), '0');
    assert.equal(M.fmt(1.23456, 2), '1.23');
    assert.ok(!M.isMatrix([1, 2, 3]) && !M.isMatrix([1, 2, 3, 4, 5, NaN]) && !M.isMatrix('x'));
});

// ---------------------------------------------------------------- the allow-list

test('allow-list: closed node set, frozen, and no scripting or reference vocabulary anywhere', () => {
    assert.deepEqual(NODE_TYPES, ['rect', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'g']);
    assert.ok(Object.isFrozen(NODES) && Object.isFrozen(NODES.rect) && Object.isFrozen(NODE_TYPES));
    const all = new Set(NODE_TYPES.flatMap(t => Object.keys(NODES[t])));
    for (const bad of ['href', 'xlink:href', 'style', 'onclick', 'onload', 'src', 'filter', 'clip-path', 'mask']) assert.ok(!all.has(bad), bad);
    for (const t of ['script', 'foreignObject', 'use', 'image', 'a', 'style', 'animate', 'set']) assert.ok(!NODE_TYPES.includes(t), t);
});

test('allow-list: the colour grammar', () => {
    for (const ok of ['#fff', '#FFFF', '#a1b2c3', '#a1b2c3d4', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'hsl(120, 50%, 50%)', 'none', 'currentColor', 'red', 'var(--color-primary)']) assert.ok(isPaint(ok), ok);
    for (const bad of ['', 'url(#a)', 'url(https://x.test/a.svg#a)', JS + 'alert(1)', 'expression(alert(1))', '#ggg', '#12345', 'rgb(1 2 3)', 'rgb(1,2,3);color:red',
        'var(--x)', 'var(--color-a);x', 'red; fill: blue', 'RED', '<x>', 'rgb(1,2,3)\u0000', 'a'.repeat(200), 5, null, {}, 'inherit']) assert.ok(!isPaint(bad), String(bad));
    assert.ok(isPaint('url(#a1)', new Set(['a1'])));
    assert.ok(!isPaint('url(#a1)', new Set(['b'])));
    assert.ok(!isPaint('url(#a1)'));
});

test('allow-list: values are clamped, repaired or refused by kind', () => {
    assert.deepEqual(cleanValue('n', 5e9), [true, LIMITS.coord]);
    assert.deepEqual(cleanValue('n', -5e9), [true, -LIMITS.coord]);
    assert.deepEqual(cleanValue('p', -3), [true, 0]);
    assert.deepEqual(cleanValue('o', 7), [true, 1]);
    for (const k of ['n', 'p', 'o']) for (const v of [NaN, Infinity, '5', null, undefined, {}, [5]]) assert.equal(cleanValue(k, v)[0], false, `${k} ${v}`);
    assert.deepEqual(cleanValue('matrix', [1, 0, 0, 1, 0, 0]), [true, undefined]);
    assert.deepEqual(cleanValue('matrix', [1, 0, 0, 1, 9e9, 0]), [true, [1, 0, 0, 1, LIMITS.coord, 0]]);
    assert.equal(cleanValue('matrix', [1, 0, 0, 1, 0])[0], false);
    assert.equal(cleanValue('points', [1, 2, 3])[0], false);
    assert.equal(cleanValue('points', [1, 2])[0], true);
    assert.equal(cleanValue('d', [['L', 1, 2]])[0], false, 'a path starts with M');
    assert.equal(cleanValue('d', [['M', 1, 2], ['C', 1, 2, 3, 4, 5]])[0], false);
    assert.equal(cleanValue('d', [['M', 1, 2], ['Q', 1, 2, 3, 4]])[0], false);
    assert.equal(cleanValue('d', [['M', 1, 2], ['constructor', 1, 2]])[0], false);
    assert.equal(cleanValue('d', [['M', 1, 2], ['Z', 5]])[0], false);
    assert.deepEqual(cleanValue('d', [['M', 1, 2], ['L', 3, 4], ['Z']]), [true, [['M', 1, 2], ['L', 3, 4], ['Z']]]);
    assert.equal(cleanValue('dash', [])[0], false);
    assert.equal(cleanValue('dash', [1, -1])[0], false);
    assert.equal(cleanValue('class', 'a b-c')[0], true);
    for (const bad of ['a"b', 'a<b', '1a', 'a;b', 'a\nb', ' a']) assert.equal(cleanValue('class', bad)[0], false, bad);
    assert.equal(cleanValue('str', 'Door')[0], true);
    assert.equal(cleanValue('str', 'a\u0000b')[0], false);
    assert.equal(cleanValue('str', 'x'.repeat(LIMITS.label + 1))[0], false);
    assert.equal(cleanValue(['a', 'b'], 'c')[0], false);
    assert.equal(cleanValue(['a', 'b'], 'toString')[0], false);
    assert.equal(cleanValue('nope', 1)[0], false);
});

// ---------------------------------------------------------------- the document

test('createSvgDoc: a valid document with a root group', () => {
    const doc = createSvgDoc({ width: 200, height: 100, units: 'mm', title: 'Sign', desc: 'A sign' });
    assert.deepEqual(validateDoc(doc), []);
    assert.equal(doc.root.id, 's1');
    assert.equal(doc.seq, 1);
    assert.equal(doc.units, 'mm');
    assert.deepEqual(doc.root.children, []);
    assert.deepEqual(createSvgDoc(), createSvgDoc({}));
    assert.equal(createSvgDoc({ units: 'furlong', width: -4 }).units, 'px');
    assert.equal(createSvgDoc({ units: 'furlong', width: -4 }).width, 100);
});

test('createNode: fresh ids from seq, never reused, descendants included, input untouched', () => {
    const doc = createSvgDoc();
    const spec = { type: 'g', attrs: { transform: M.translate(5, 5) }, children: [rect(), { type: 'text', attrs: { x: 0, y: 0 }, text: 'Hi' }] };
    const before = toJson(doc);
    const a = createNode(doc, spec);
    assert.equal(toJson(doc), before);
    assert.deepEqual(a.problems, []);
    assert.deepEqual([a.node.id, a.node.children[0].id, a.node.children[1].id], ['s2', 's3', 's4']);
    assert.equal(a.doc.seq, 4);
    const b = createNode(a.doc, rect());
    assert.equal(b.node.id, 's5');
    assert.equal(createNode(a.doc, { ...rect(), id: 's1' }).node.id, 's5', 'a spec id is ignored');
    const bad = createNode(doc, { type: 'script' });
    assert.equal(bad.node, null);
    assert.equal(bad.doc, doc);
    assert.equal(bad.problems[0].code, 'node-type');
});

test('tree helpers: walk, locate, findNode, stats, ids', () => {
    let doc = createSvgDoc();
    const g = createNode(doc, { type: 'g', children: [rect(), rect()] });
    doc = { ...g.doc, root: { ...g.doc.root, children: [g.node] } };
    assert.deepEqual(validateDoc(doc), []);
    assert.deepEqual(ids(doc), ['s1', 's2', 's3', 's4']);
    assert.deepEqual(stats(doc), { nodes: 4, depth: 3 });
    const l = locate(doc, 's4');
    assert.equal(l.parent.id, 's2');
    assert.equal(l.index, 1);
    assert.equal(findNode(doc, 's9'), null);
    const order = [];
    walk(doc.root, (n, p, d) => { order.push(`${n.id}@${d}`); });
    assert.deepEqual(order, ['s1@1', 's2@2', 's3@3', 's4@3']);
    assert.equal(walk(doc.root, n => n.id === 's3'), true);
});

test('JSON round trip: every node type, equal and byte-stable', () => {
    let doc = createSvgDoc({ width: 210, height: 297, units: 'mm', title: 'T', desc: 'D' });
    const specs = [
        rect({ rx: 1, ry: 1, fill: '#c00', stroke: 'rgb(0,0,0)', 'stroke-width': 0.5, opacity: 0.5, transform: M.rotate(30, 10, 10), 'stroke-dasharray': [2, 1], title: 'Door', class: 'a b', 'aria-hidden': true }),
        { type: 'ellipse', attrs: { cx: 5, cy: 5, rx: 3, ry: 3, 'fill-rule': 'evenodd' } },
        { type: 'line', attrs: { x1: 0, y1: 0, x2: 9, y2: 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'bevel' } },
        { type: 'polyline', attrs: { points: [0, 0, 5, 5, 9, 0], fill: 'none' } },
        { type: 'polygon', attrs: { points: [0, 0, 5, 5, 9, 0] } },
        { type: 'path', attrs: { d: [['M', 0, 0], ['L', 5, 5], ['C', 1, 2, 3, 4, 5, 6], ['Z']] } },
        { type: 'text', attrs: { x: 1, y: 2, 'font-size': 12, 'font-family': 'monospace', 'text-anchor': 'middle' }, text: 'a < b & "c"' },
        { type: 'g', attrs: { 'aria-label': 'Group' }, children: [rect()] },
    ];
    const children = [];
    for (const s of specs) { const r = createNode(doc, s); assert.deepEqual(r.problems, [], s.type); doc = r.doc; children.push(r.node); }
    doc = { ...doc, root: { ...doc.root, children } };
    assert.deepEqual(validateDoc(doc), []);
    const text = toJson(doc);
    const back = fromJson(text);
    assert.deepEqual(back.problems, []);
    assert.deepEqual(back.doc, doc);
    assert.equal(toJson(back.doc), text);
    assert.ok(equalDocs(doc, back.doc));
});

test('normalize: repairs are reported, canonical form is a fixed point', () => {
    const { doc, problems } = normalizeDoc({
        version: 1, seq: 2, width: 'wide', height: 50, units: 'mm', title: 'a\u0001b',
        root: { id: 's1', type: 'g', attrs: { transform: [1, 0, 0, 1, 0, 0], onclick: 'x()', fill: JS + '1', opacity: 4 }, children: [
            { id: 's2', type: 'rect', attrs: { x: '1', width: 10, height: 10, href: 'x' }, children: [{ type: 'rect' }], text: 'no' },
            { id: 's2', type: 'ellipse', attrs: { rx: 1, ry: 2 } },
            { type: 'script', children: [] }, 'str', null, { id: 'evil', type: 'line', attrs: {} },
        ] },
    });
    const codes = problems.map(p => p.code);
    for (const c of ['doc-size', 'doc-text', 'attr-unknown', 'attr-value', 'children', 'text', 'node-type', 'node']) assert.ok(codes.includes(c), c);
    assert.deepEqual(doc.root.attrs, { opacity: 1 });
    assert.deepEqual(doc.root.children.map(c => c.type), ['rect', 'ellipse', 'line']);
    assert.equal(new Set(ids(doc)).size, ids(doc).length, 'ids stay unique');
    assert.ok(doc.seq >= Math.max(...ids(doc).map(i => Number(i.slice(1)))));
    assert.deepEqual(validateDoc(doc), []);
    assert.deepEqual(normalizeDoc(doc).problems, []);
    assert.deepEqual(normalizeDoc(doc).doc, doc);
    assert.ok(problems.every(p => p.code && p.message && typeof p.path === 'string' && ['warn', 'error'].includes(p.severity)));
});

test('normalize: duplicate and malformed ids get fresh ones, seq never goes backwards', () => {
    const { doc } = normalizeDoc({ seq: 1, root: { id: 's1', type: 'g', children: [{ id: 's7', type: 'g' }, { id: 's7', type: 'g' }, { id: 's01', type: 'g' }, { id: '__proto__', type: 'g' }] } });
    assert.deepEqual(ids(doc), ['s1', 's7', 's8', 's9', 's10']);
    assert.equal(doc.seq, 10);
});

test('normalize: a bad root becomes an empty group with an error problem', () => {
    for (const root of [null, 5, { type: 'rect' }, [], { type: 'g', children: 'x' }]) {
        const r = normalizeDoc({ root });
        assert.equal(r.doc.root.type, 'g');
        assert.ok(r.doc.root.id.startsWith('s'));
        assert.deepEqual(validateDoc(r.doc), []);
    }
    assert.equal(normalizeDoc({ root: null }).problems.find(p => p.code === 'root').severity, 'error');
});

test('validateDoc reports a valid but non canonical document', () => {
    const doc = createSvgDoc();
    assert.deepEqual(validateDoc(doc), []);
    assert.equal(validateDoc({ ...doc, root: { ...doc.root, attrs: { transform: [1, 0, 0, 1, 0, 0] } } })[0].code, 'canonical');
    assert.equal(validateDoc({ ...doc, extra: 1 })[0].code, 'canonical');
});

// ---------------------------------------------------------------- limits

test('limits: node count, depth, path segments, coordinates, input size', () => {
    const many = { id: 's1', type: 'g', children: Array.from({ length: LIMITS.nodes + 50 }, () => ({ type: 'rect' })) };
    const r = normalizeDoc({ root: many });
    assert.equal(stats(r.doc).nodes, LIMITS.nodes);
    assert.equal(r.problems.filter(p => p.code === 'limit-nodes').length, 1);
    let deep = { type: 'rect' };
    for (let i = 0; i < 400; i++) deep = { type: 'g', children: [deep] };
    const d = normalizeDoc({ root: deep });
    assert.equal(stats(d.doc).depth, LIMITS.depth);
    assert.ok(d.problems.some(p => p.code === 'limit-depth'));
    const long = Array.from({ length: LIMITS.segments + 1 }, (_, i) => ['L', i, i]);
    const p = normalizeDoc({ root: { type: 'g', children: [{ type: 'path', attrs: { d: [['M', 0, 0], ...long] } }] } });
    assert.equal(p.doc.root.children[0].attrs.d, undefined);
    assert.ok(p.problems.some(x => x.code === 'attr-value'));
    const big = fromJson(JSON.stringify({ title: 'x'.repeat(LIMITS.input) }));
    assert.equal(big.problems[0].code, 'input-size');
    assert.deepEqual(validateDoc(big.doc), []);
    const tight = normalizeDoc({ root: { type: 'g', children: [{ type: 'rect' }, { type: 'rect' }, { type: 'rect' }] } }, { nodes: 2, depth: 99, coord: 1e12 });
    assert.equal(stats(tight.doc).nodes, 2, 'limits tighten');
    assert.equal(normalizeDoc({ width: 5e9 }, { coord: 1e12 }).doc.width, LIMITS.coord, 'limits never loosen');
});

// ---------------------------------------------------------------- hostile corpus and properties

test('hostile corpus: fromJson never throws and always yields a valid document', () => {
    const inputs = [
        '', ' ', 'null', 'true', '5', '"x"', '[]', '{}', '{', '{"root":', '\u0000', '{"__proto__":{"polluted":1}}', '{"root":{"type":"g","__proto__":{"polluted":1}}}',
        '{"constructor":{"prototype":{"polluted":1}}}', '{"root":{"type":"constructor"}}', '{"root":{"type":"g","children":[{"type":"toString"}]}}',
        '{"root":{"type":"g","attrs":{"__proto__":{"fill":"red"},"constructor":1}}}', '{"version":99,"seq":-5,"width":1e999,"height":"1e999"}',
        '{"seq":1e999}', '{"seq":1.5}', '{"seq":9999999999}', '{"root":{"type":"g","children":[{"type":"script","children":[{"type":"rect"}]}]}}',
        '{"root":{"type":"g","attrs":{"fill":"url(https://evil.test/x.svg#a)","stroke":"url(' + JS + 'alert(1))","onload":"alert(1)","style":"fill:red"}}}',
        '{"root":{"type":"g","children":[{"type":"text","text":"<script>alert(1)</script>"}]}}',
        '{"root":{"type":"g","children":[{"type":"foreignObject"},{"type":"use","attrs":{"href":"#a"}},{"type":"image","attrs":{"href":"data:image/svg+xml,<svg onload=alert(1)>"}}]}}',
        '{"root":{"type":"path","attrs":{"d":"M 0 0 L 10 10"}}}', '{"root":{"type":"g","children":[{"type":"path","attrs":{"d":[["M",1e999,0]]}}]}}',
        '{"root":{"type":"g","children":[{"type":"polygon","attrs":{"points":[1,2,3,null]}}]}}', '{"root":{"type":"g","attrs":{"transform":"rotate(5)"}}}',
        '{"title":{"a":1},"desc":[1],"units":{"x":1}}', '{"root":{"id":{"a":1},"type":"g"}}', '{"root":{"type":"g","children":{"length":99999999}}}',
        '[' .repeat(5000) + ']'.repeat(5000), '{"a":'.repeat(2000) + '1' + '}'.repeat(2000),
    ];
    for (const text of inputs) {
        let r;
        assert.doesNotThrow(() => { r = fromJson(text); }, text.slice(0, 40));
        assert.deepEqual(validateDoc(r.doc), [], text.slice(0, 40));
        assert.equal(({}).polluted, undefined);
        assert.equal(r.doc.root.attrs?.fill, undefined, text.slice(0, 40));
        const out = toJson(r.doc);
        assert.ok(!new RegExp(`foreignObject|${JS}|onload|href|style`).test(out), 'no forbidden vocabulary survives: ' + text.slice(0, 40));
        assert.equal(toJson(fromJson(out).doc), out, 'fixed point');
    }
    // objects passed directly (not text), including shared and cyclic references
    const cyc = { type: 'g', children: [] };
    cyc.children.push(cyc);
    const shared = { type: 'rect' };
    assert.doesNotThrow(() => normalizeDoc({ root: cyc }));
    assert.deepEqual(validateDoc(normalizeDoc({ root: cyc }).doc), []);
    const s = normalizeDoc({ root: { type: 'g', children: [shared, shared] } }).doc;
    assert.notEqual(s.root.children[0], s.root.children[1]);
    assert.notEqual(s.root.children[0].attrs, s.root.children[1].attrs);
    for (const v of [undefined, NaN, () => 1, Symbol.iterator, 1n, new Date(0), new Map()]) assert.doesNotThrow(() => normalizeDoc(v));
});

test('hostile corpus: attribute values never reach the model unless they pass the grammar', () => {
    const payloads = ['red" onload="x', '</svg><script>x</script>', 'url(#a)', "x'; fill: red", 'expression(1)', ' ', 'a&amp;b'];
    for (const bad of payloads) {
        const r = createNode(createSvgDoc(), { type: 'rect', attrs: { fill: bad, stroke: bad, class: bad, 'font-family': bad, 'text-anchor': bad } });
        assert.deepEqual(r.node.attrs, {}, bad);
    }
    const t = createNode(createSvgDoc(), { type: 'text', text: 'ok\u0000\u0008\u001f￾' });
    assert.equal(t.node.text, 'ok');
});

test('property: random garbage documents always normalize to valid, canonical, id-unique documents (seeded)', () => {
    let s = 987654321;
    const rnd = n => { s = (s * 1664525 + 1013904223) % 4294967296; return Math.floor((s / 4294967296) * n); };
    const pick = a => a[rnd(a.length)];
    const val = d => pick([() => rnd(100) - 50, () => 'x', () => null, () => true, () => [rnd(9), rnd(9)], () => ({}), () => rnd(1e9) * 1e3, () => '#abc', () => 'none',
        () => ['M', rnd(9), rnd(9)], () => M.rotate(rnd(360))])();
    const node = d => {
        const n = { type: pick([...NODE_TYPES, 'bogus', 7]), attrs: {} };
        if (rnd(3)) n.id = pick(['s1', 's2', 's3', 'x', 5, 's' + rnd(20)]);
        for (let i = rnd(5); i > 0; i--) n.attrs[pick([...Object.keys(NODES.rect), ...Object.keys(NODES.path), 'zzz'])] = val();
        if (d < 5) n.children = Array.from({ length: rnd(4) }, () => node(d + 1));
        if (rnd(4) === 0) n.text = pick(['a', 5, '\u0000']);
        return n;
    };
    for (let i = 0; i < 300; i++) {
        const raw = { version: 1, seq: rnd(30), width: val(), height: val(), units: pick(['mm', 'in', 'x', 5]), title: pick(['t', 5, '']), root: node(0) };
        const { doc, problems } = normalizeDoc(raw);
        assert.deepEqual(validateDoc(doc), [], `iteration ${i}`);
        assert.equal(new Set(ids(doc)).size, ids(doc).length);
        assert.ok(doc.seq >= Math.max(...ids(doc).map(x => Number(x.slice(1)))));
        assert.equal(toJson(fromJson(toJson(doc)).doc), toJson(doc));
        assert.ok(Array.isArray(problems));
    }
});

test('performance (reported, generous bounds): 1,000 shapes build and round trip quickly', () => {
    let doc = createSvgDoc({ width: 1000, height: 1000 });
    const t0 = performance.now();
    const children = [];
    for (let i = 0; i < 1000; i++) { const r = createNode(doc, rect({ x: i })); doc = r.doc; children.push(r.node); }
    doc = { ...doc, root: { ...doc.root, children } };
    const t1 = performance.now();
    const back = fromJson(toJson(doc));
    const t2 = performance.now();
    assert.equal(stats(back.doc).nodes, 1001);
    assert.ok(t1 - t0 < 2000 && t2 - t1 < 1000, `build ${(t1 - t0).toFixed(0)} ms, round trip ${(t2 - t1).toFixed(0)} ms`);
});

// ---------------------------------------------------------------- shape of the code

test('the svg modules are separable: they import only each other, stay small, and have no DOM or side effects', () => {
    const dir = fileURLToPath(new URL('../js/svg/', import.meta.url));
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
        const code = fs.readFileSync(dir + f, 'utf8');
        for (const m of code.matchAll(/(?:import|export)[^'"\n]*from\s+'([^']+)'/g)) assert.match(m[1], /^\.\/[a-z-]+\.js$/, `${f} imports ${m[1]}`);
        assert.ok(!/\b(document\.|window\b|globalThis|innerHTML|console\.|setTimeout|DOMParser|fetch\(|localStorage|eval\(|new Function)/.test(code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), `${f} touches the environment`);
        const gz = zlib.gzipSync(Buffer.from(code)).length / 1024;
        assert.ok(gz < 6, `${f} is ${gz.toFixed(2)} KB gzip, module budget 6`);
    }
});
