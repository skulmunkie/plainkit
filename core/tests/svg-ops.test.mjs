// SVG toolkit phase S2 (#431): document operations. Pure, immutable (the documents are deep-frozen, so any mutation throws), structurally shared,
// ids never reused, limits and the model's validity kept after every operation, hostile arguments. No DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/svg/matrix.js';
import { LIMITS, createSvgDoc, validateDoc, findNode, ids, stats, locate, walk, toJson, fromJson } from '../js/svg/model.js';
import * as O from '../js/svg/ops.js';
import { createHistory, record, undo, redo } from '../js/history.js';

const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(freeze); } return v; };
const rectSpec = (x = 0, extra = {}) => ({ type: 'rect', attrs: { x, y: 0, width: 10, height: 10, ...extra } });
const valid = doc => { assert.deepEqual(validateDoc(doc), []); assert.equal(new Set(ids(doc)).size, ids(doc).length, 'unique ids'); return doc; };
const kids = (doc, id = doc.root.id) => findNode(doc, id).children.map(c => c.id);
/** Applies an op to a frozen document and checks the result is valid, frozen-safe and consistent. */
const step = (doc, r) => { freeze(r.doc); valid(r.doc); assert.equal(r.changed, r.doc !== doc); return r; };
function build(n = 4) {
    let doc = freeze(createSvgDoc({ width: 100, height: 100 }));
    const made = [];
    for (let i = 0; i < n; i++) { const r = step(doc, O.insert(doc, rectSpec(i * 10))); doc = freeze(r.doc); made.push(r.ids[0]); }
    return { doc, made };
}

test('insert: new id from seq, position, into a group, sanitised, original untouched', () => {
    let doc = freeze(createSvgDoc());
    let r = step(doc, O.insert(doc, rectSpec(1)));
    assert.deepEqual(r.ids, ['s2']); assert.ok(r.changed); assert.equal(r.key, null);
    assert.equal(r.doc.seq, 2); assert.equal(doc.seq, 1); assert.deepEqual(kids(doc), []);
    const a = r.doc;
    r = step(a, O.insert(a, rectSpec(2), { index: 0 }));
    assert.deepEqual(kids(r.doc), ['s3', 's2']);
    const g = step(r.doc, O.insert(r.doc, { type: 'g', attrs: {}, children: [rectSpec(3), rectSpec(4)] }));
    assert.deepEqual(g.ids, ['s4']); assert.deepEqual(kids(g.doc, 's4'), ['s5', 's6']);
    const inside = step(g.doc, O.insert(g.doc, rectSpec(5), { parent: 's4', index: 1 }));
    assert.deepEqual(kids(inside.doc, 's4'), ['s5', 's7', 's6']);
    const bad = O.insert(doc, { type: 'rect', attrs: { x: 1, fill: 'url(https://x.test/a)', onclick: 'x' } });
    assert.ok(bad.changed && bad.problems.length >= 2 && !('fill' in findNode(bad.doc, bad.ids[0]).attrs));
});

test('insert: refuses a missing parent, a non-group parent, an unknown type; clamps a hostile index', () => {
    const { doc, made } = build(2);
    for (const parent of ['nope', made[0], '__proto__', null]) {
        const r = O.insert(doc, rectSpec(), { parent });
        assert.ok(!r.changed && r.doc === doc && r.problems[0].severity === 'error', String(parent));
    }
    const t = O.insert(doc, { type: 'script', attrs: {} });
    assert.ok(!t.changed && t.doc === doc && t.doc.seq === doc.seq && t.problems.length);
    for (const spec of [null, 5, 'x', [], { type: 5 }]) assert.ok(!O.insert(doc, spec).changed);
    for (const index of [-5, 1e9, NaN, 1.5, '1', {}]) assert.ok(O.insert(doc, rectSpec(), { index }).changed);
    assert.deepEqual(kids(O.insert(doc, rectSpec(), { index: -5 }).doc).length, 3);
});

test('remove: the node and its subtree, ids not reused, nested/duplicate/unknown/root reported', () => {
    const { doc, made } = build(3);
    const g = step(doc, O.group(doc, made.slice(0, 2)));
    const gid = g.ids[0];
    let r = step(g.doc, O.remove(g.doc, [gid, made[0], made[0], 'zz', g.doc.root.id]));
    assert.deepEqual(r.ids, [gid]); assert.deepEqual(kids(r.doc), [made[2]]);
    assert.deepEqual(r.problems.map(p => p.code).sort(), ['root', 'unknown-id']);
    const again = O.insert(r.doc, rectSpec());
    assert.ok(Number(again.ids[0].slice(1)) > Number(gid.slice(1)), 'a removed id is never reused');
    assert.ok(!O.remove(doc, []).changed && !O.remove(doc, 'nope').changed && O.remove(doc, made[0]).changed);
    for (const bad of [null, undefined, 5, {}, ['__proto__'], [null], [{}]]) assert.doesNotThrow(() => O.remove(doc, bad));
});

test('structural sharing: untouched nodes are the same objects, the touched path is new', () => {
    const { doc, made } = build(4);
    const g = O.group(doc, [made[0], made[1]]).doc;
    const r = O.transform(g, [made[3]], M.translate(5, 5));
    assert.equal(findNode(r.doc, made[2]), findNode(g, made[2]));
    assert.equal(findNode(r.doc, made[0]), findNode(g, made[0]));
    assert.equal(findNode(r.doc, g.root.children[0].id), findNode(g, g.root.children[0].id), 'a sibling group is shared whole');
    assert.notEqual(r.doc.root, g.root); assert.notEqual(findNode(r.doc, made[3]), findNode(g, made[3]));
    const same = O.reorder(g, [made[3]], 'front');
    assert.ok(!same.changed && same.doc === g, 'a no-op returns the same document');
});

test('move: reparent, order, index, cycles refused, look kept through group transforms', () => {
    let { doc, made } = build(4);
    const [a, b, c, d] = made;
    const g = step(doc, O.group(doc, [a, b]));
    const gid = g.ids[0];
    doc = freeze(g.doc);
    let r = step(doc, O.move(doc, [d, c], { parent: gid, index: 1 }));
    assert.deepEqual(kids(r.doc, gid), [a, c, d, b], 'moved nodes keep their document order');
    assert.deepEqual(r.ids, [c, d]);
    r = step(doc, O.move(doc, [a], { index: 5 }));
    assert.deepEqual(kids(r.doc), [gid, c, d, a]);
    assert.equal(kids(r.doc).at(-1), a);
    assert.ok(O.move(doc, [gid], { parent: gid }).problems[0].code === 'cycle');
    const deep = O.insert(doc, { type: 'g', attrs: {} }, { parent: gid });
    assert.equal(O.move(deep.doc, [gid], { parent: deep.ids[0] }).problems[0].code, 'cycle');
    assert.ok(!O.move(doc, [a], { parent: c }).changed, 'not into a rect');
    assert.ok(!O.move(doc, [a], { parent: 'nope' }).changed);
    // look kept: a group translated by (100, 0) receives a rect; the rect moves by -100 so it stays where it was on the page
    const t = O.transform(doc, [gid], M.translate(100, 0)).doc;
    r = step(t, O.move(t, [d], { parent: gid }));
    assert.deepEqual(findNode(r.doc, d).attrs.transform, M.translate(-100, 0));
    const world = n => M.multiply(O.parentMatrix(r.doc, n), findNode(r.doc, n).attrs.transform ?? M.IDENTITY);
    assert.ok(M.equals(world(d), M.IDENTITY), 'same place on the page');
    const raw = O.move(t, [d], { parent: gid, keepLook: false });
    assert.equal(findNode(raw.doc, d).attrs.transform, undefined);
    // a flattening group cannot receive without changing the look
    const flat = O.setAttrs(doc, gid, { transform: [0, 0, 0, 0, 0, 0] }).doc;
    const sing = O.move(flat, [d], { parent: gid });
    assert.ok(!sing.changed && sing.problems[0].code === 'singular');
    assert.ok(O.move(flat, [d], { parent: gid, keepLook: false }).changed);
});

test('group: wraps at the first selected position, shares a parent, new id, ungroup restores', () => {
    const { doc, made } = build(5);
    const [a, b, c, d, e] = made;
    const r = step(doc, O.group(doc, [d, b]));          // order in the argument does not matter
    const gid = r.ids[0];
    assert.deepEqual(kids(r.doc), [a, gid, c, e]); assert.deepEqual(kids(r.doc, gid), [b, d]);
    assert.ok(Number(gid.slice(1)) > Number(e.slice(1)));
    assert.equal(findNode(r.doc, b), findNode(doc, b), 'children are shared, not copied');
    const nested = step(r.doc, O.group(r.doc, [b, d]));
    assert.equal(nested.ids.length, 1);
    const cross = O.group(r.doc, [a, b]);
    assert.ok(!cross.changed && cross.problems[0].code === 'group-parents');
    assert.ok(!O.group(doc, []).changed && !O.group(doc, ['nope']).changed && !O.group(doc, [doc.root.id]).changed);
    const back = step(r.doc, O.ungroup(r.doc, [gid]));
    assert.deepEqual(kids(back.doc), [a, b, d, c, e]);
    assert.deepEqual(back.ids, [b, d]);
    assert.deepEqual(findNode(back.doc, b).attrs, findNode(doc, b).attrs, 'an identity group changes nothing on its children');
});

test('ungroup: bakes the matrix, pushes the inherited look down, warns where the look cannot be kept', () => {
    let doc = freeze(createSvgDoc());
    const g = O.insert(doc, { type: 'g', attrs: { transform: M.translate(10, 20), fill: '#c00', stroke: '#000', opacity: 0.5, class: 'x' }, children: [
        rectSpec(0), rectSpec(1, { fill: '#00f', transform: M.scale(2) }), { type: 'g', attrs: { transform: M.translate(1, 1) }, children: [rectSpec(2)] }] });
    const r = step(g.doc, O.ungroup(g.doc, g.ids));
    assert.equal(r.ids.length, 3); assert.equal(stats(r.doc).nodes, 5);
    const [k0, k1, k2] = r.ids.map(i => findNode(r.doc, i));
    assert.deepEqual(k0.attrs.transform, M.translate(10, 20));
    assert.deepEqual(k1.attrs.transform, M.multiply(M.translate(10, 20), M.scale(2)));
    assert.deepEqual(k2.attrs.transform, M.translate(11, 21));
    assert.equal(k0.attrs.fill, '#c00'); assert.equal(k1.attrs.fill, '#00f', 'a child keeps its own look'); assert.equal(k0.attrs.stroke, '#000');
    assert.equal(k0.attrs.opacity, 0.5);
    assert.deepEqual(r.problems.map(p => p.code).sort(), ['ungroup-dropped', 'ungroup-opacity']);
    assert.equal(findNode(r.doc, k2.children[0].id).attrs.fill, undefined, 'a nested group pushes nothing below its child');
    const notG = O.ungroup(r.doc, [r.ids[0]]);
    assert.ok(!notG.changed && notG.problems[0].code === 'not-group');
    assert.ok(!O.ungroup(g.doc, [g.doc.root.id]).changed);
    const empty = O.insert(doc, { type: 'g', attrs: {} });
    assert.deepEqual(kids(O.ungroup(empty.doc, empty.ids).doc), []);
    // the page position of every point of every child is the same before and after
    const tree = freeze(createSvgDoc());
    const o = O.insert(tree, { type: 'g', attrs: { transform: M.rotate(30, 5, 5) }, children: [{ type: 'g', attrs: { transform: M.scale(2, 3) }, children: [rectSpec(4)] }] });
    const inner = locate(o.doc, o.ids[0]).node.children[0].children[0].id;
    const before = M.multiply(O.parentMatrix(o.doc, inner), M.IDENTITY);
    const after = O.ungroup(O.ungroup(o.doc, o.ids).doc, [locate(o.doc, o.ids[0]).node.children[0].id]).doc;
    assert.ok(M.equals(M.multiply(O.parentMatrix(after, inner), findNode(after, inner).attrs.transform), before, 1e-9));
});

test('reorder: front, back, forward, backward with several selected, per parent', () => {
    const { doc, made } = build(5);
    const [a, b, c, d, e] = made;
    const ord = (to, sel) => kids(step(doc, O.reorder(doc, sel, to)).doc);
    assert.deepEqual(ord('front', [b, d]), [a, c, e, b, d]);
    assert.deepEqual(ord('back', [b, d]), [b, d, a, c, e]);
    assert.deepEqual(ord('forward', [b, d]), [a, c, b, e, d]);
    assert.deepEqual(ord('backward', [b, d]), [b, a, d, c, e]);
    assert.deepEqual(ord('forward', [d, e]), [a, b, c, d, e], 'already on top');
    assert.deepEqual(ord('backward', [a]), [a, b, c, d, e]);
    assert.ok(!O.reorder(doc, [e], 'front').changed);
    assert.equal(O.reorder(doc, [a], 'sideways').problems[0].severity, 'error');
    const g = O.group(doc, [a, b]).doc;
    const both = step(g, O.reorder(g, [a, e], 'front'));
    assert.deepEqual(kids(both.doc, g.root.children[0].id), [b, a]);
});

test('transform: parent space by default, local on request, matrix kept clean, coalescing key, refusals', () => {
    const { doc, made } = build(2);
    const [a, b] = made;
    let r = step(doc, O.transform(doc, [a, b], M.translate(5, 0)));
    assert.deepEqual(findNode(r.doc, a).attrs.transform, M.translate(5, 0)); assert.equal(r.key, 'svg-transform:' + a + ',' + b);
    const r2 = step(r.doc, O.transform(r.doc, [a], M.scale(2)));
    assert.deepEqual(findNode(r2.doc, a).attrs.transform, M.multiply(M.scale(2), M.translate(5, 0)));
    const loc = step(r.doc, O.transform(r.doc, [a], M.scale(2), { local: true }));
    assert.deepEqual(findNode(loc.doc, a).attrs.transform, M.multiply(M.translate(5, 0), M.scale(2)));
    const back = step(r.doc, O.transform(r.doc, [a, b], M.translate(-5, 0)));
    assert.equal(findNode(back.doc, a).attrs.transform, undefined, 'an identity result leaves the attribute out');
    assert.ok(!O.transform(doc, [a], M.IDENTITY).changed);
    for (const bad of [null, [1], [1, 2, 3, 4, 5, NaN], 'x', [0, 0, 0, 0, 0, 0], [1, 2, 2, 4, 0, 0], [Infinity, 0, 0, 1, 0, 0]]) assert.ok(!O.transform(doc, [a], bad).changed && O.transform(doc, [a], bad).problems[0].severity === 'error');
    const huge = step(doc, O.transform(doc, [a], M.translate(1e300, -1e300)));
    assert.deepEqual(findNode(huge.doc, a).attrs.transform, M.translate(LIMITS.coord, -LIMITS.coord));
    const g = O.group(doc, [a, b]);
    const once = step(g.doc, O.transform(g.doc, [g.ids[0], a, b], M.translate(7, 0)));
    assert.equal(findNode(once.doc, a).attrs.transform, undefined, 'a selected child under a selected group is not moved twice');
});

test('setAttrs: checked against the allow-list, null removes, unchanged is a no-op, root allowed', () => {
    const { doc, made } = build(1);
    const [a] = made;
    let r = step(doc, O.setAttrs(doc, a, { fill: '#c00', x: 5, width: -4, rx: 'x', onclick: 'x', href: 'y', stroke: 'url(#q)' }));
    const at = findNode(r.doc, a).attrs;
    assert.equal(at.fill, '#c00'); assert.equal(at.x, 5); assert.equal(at.width, 0); assert.equal(at.rx, undefined);
    assert.deepEqual(r.problems.map(p => p.path).sort(), ['href', 'onclick', 'rx', 'stroke']);
    assert.ok(!O.setAttrs(r.doc, a, { fill: '#c00', x: 5 }).changed);
    assert.equal(findNode(step(r.doc, O.setAttrs(r.doc, a, { fill: null })).doc, a).attrs.fill, undefined);
    assert.ok(O.setAttrs(doc, doc.root.id, { opacity: 0.5 }).changed);
    for (const bad of [null, 5, 'x', [], undefined]) assert.ok(!O.setAttrs(doc, a, bad).changed);
    assert.ok(!O.setAttrs(doc, 'nope', { fill: 'red' }).changed);
    const text = O.insert(doc, { type: 'text', attrs: {}, text: 'hi' });
    assert.equal(findNode(O.setAttrs(text.doc, text.ids[0], { 'font-family': 'serif', 'text-anchor': 'middle' }).doc, text.ids[0]).attrs['text-anchor'], 'middle');
    assert.ok(!O.setAttrs(text.doc, text.ids[0], { 'font-family': 'Comic Sans' }).changed);
    const pathOnly = O.insert(doc, { type: 'path', attrs: { d: [['M', 0, 0], ['L', 1, 1]] } });
    assert.ok(O.setAttrs(pathOnly.doc, pathOnly.ids[0], { d: [['M', 1, 1]] }).changed);
    assert.ok(!O.setAttrs(pathOnly.doc, pathOnly.ids[0], { d: [['L', 1, 1]] }).changed);
});

test('limits: node count and depth are refused, the document stays valid and unchanged', () => {
    let doc = freeze(createSvgDoc());
    let parent = doc.root.id;
    for (let i = 1; i < LIMITS.depth; i++) { const r = O.insert(doc, { type: 'g', attrs: {} }, { parent }); doc = freeze(r.doc); parent = r.ids[0]; }
    assert.equal(stats(doc).depth, LIMITS.depth);
    const tooDeep = O.insert(doc, rectSpec(), { parent });
    assert.ok(!tooDeep.changed && tooDeep.problems[0].code === 'limit' && tooDeep.doc === doc);
    const top = O.insert(doc, rectSpec());
    const wrap = O.group(top.doc, [doc.root.children[0].id]);       // wrapping the deepest chain would be one level too deep
    assert.ok(!wrap.changed && wrap.problems[0].code === 'limit');
    const into = O.move(top.doc, [top.ids[0]], { parent });
    assert.ok(!into.changed && into.problems[0].code === 'limit');
    let wide = freeze(createSvgDoc());
    const spec = { type: 'g', attrs: {}, children: Array.from({ length: 1000 }, () => rectSpec()) };
    for (let i = 0; i < 5; i++) wide = freeze(O.insert(wide, spec).doc);
    assert.ok(stats(wide).nodes <= LIMITS.nodes);
    const over = O.insert(wide, rectSpec());
    assert.ok(!over.changed || stats(over.doc).nodes <= LIMITS.nodes);
    valid(wide);
});

test('history: an operation result goes straight into js/history.js; a drag is one step, undo and redo restore the same documents', () => {
    const { doc, made } = build(2);
    let h = createHistory(doc);
    let cur = doc;
    for (let i = 1; i <= 5; i++) { const r = O.transform(cur, [made[0]], M.translate(1, 0)); cur = r.doc; h = record(h, cur, { key: r.key, at: 100 * i }); }
    assert.equal(h.past.length, 1, 'five drag moves, one step');
    assert.deepEqual(findNode(h.present, made[0]).attrs.transform, M.translate(5, 0));
    const noop = O.reorder(cur, [made[1]], 'front');
    assert.equal(record(h, noop.doc, { key: noop.key, at: 9000 }), h, 'a no-op adds no step');
    const g = O.group(cur, made);
    h = record(h, g.doc, { at: 9000 });
    h = undo(h); assert.equal(toJson(h.present), toJson(cur));
    h = undo(h); assert.equal(toJson(h.present), toJson(doc));
    h = redo(redo(h)); assert.equal(toJson(h.present), toJson(g.doc));
    assert.equal(fromJson(toJson(h.present)).problems.length, 0, 'results round trip through JSON');
});

test('inputs are never mutated and results share nothing mutable (deep-frozen documents, every op)', () => {
    const { doc, made } = build(4);
    const g = freeze(O.group(doc, [made[0], made[1]]).doc);
    const gid = g.root.children[0].id;
    const calls = [
        () => O.insert(g, rectSpec()), () => O.remove(g, [made[2]]), () => O.move(g, [made[2]], { parent: gid }), () => O.group(g, [made[2], made[3]]),
        () => O.ungroup(g, [gid]), () => O.reorder(g, [made[2]], 'back'), () => O.transform(g, [gid], M.rotate(45)), () => O.setAttrs(g, made[2], { fill: 'red' }),
    ];
    for (const call of calls) { const before = toJson(g); const r = call(); assert.equal(toJson(g), before); freeze(r.doc); valid(r.doc); }
});

// ---------------------------------------------------------------- property and hostile

function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }

test('property: 300 random operation sequences keep the document valid, ids unique, ids never reused, limits intact (seeded)', () => {
    for (let seed = 1; seed <= 300; seed++) {
        const rnd = rng(seed), pickOf = a => a[Math.floor(rnd() * a.length)];
        let doc = freeze(createSvgDoc({ width: 50, height: 50 }));
        const everSeen = new Set(ids(doc));
        for (let i = 0; i < 40; i++) {
            const all = ids(doc), some = () => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => (rnd() < 0.05 ? 'bogus' : pickOf(all)));
            const groups = []; walk(doc.root, n => { if (n.type === 'g') groups.push(n.id); });
            const op = Math.floor(rnd() * 9);
            const r = [
                () => O.insert(doc, rnd() < 0.3 ? { type: 'g', attrs: {}, children: [rectSpec(i)] } : rectSpec(i, rnd() < 0.2 ? { fill: 'red' } : {}), { parent: pickOf(groups), index: Math.floor(rnd() * 6) - 1 }),
                () => O.remove(doc, some()),
                () => O.move(doc, some(), { parent: pickOf(groups), index: Math.floor(rnd() * 6), keepLook: rnd() < 0.7 }),
                () => O.group(doc, some()),
                () => O.ungroup(doc, some()),
                () => O.reorder(doc, some(), pickOf(['front', 'back', 'forward', 'backward'])),
                () => O.transform(doc, some(), M.multiply(M.translate(rnd() * 20, rnd() * 20), M.rotate(rnd() * 360)), { local: rnd() < 0.3 }),
                () => O.setAttrs(doc, pickOf(all), { fill: pickOf(['red', '#00f', 'bad;', null]), opacity: rnd() }),
                () => O.transform(doc, some(), M.scale(rnd() < 0.2 ? 0 : 1 + rnd())),
            ][op]();
            assert.equal(r.changed, r.doc !== doc);
            assert.deepEqual(validateDoc(r.doc), [], `seed ${seed} step ${i} op ${op}`);
            const have = ids(r.doc);
            assert.equal(new Set(have).size, have.length);
            assert.ok(r.doc.seq >= doc.seq);
            const s = stats(r.doc); assert.ok(s.nodes <= LIMITS.nodes && s.depth <= LIMITS.depth);
            for (const id of have) assert.ok(everSeen.has(id) || Number(id.slice(1)) > [...everSeen].reduce((m, v) => Math.max(m, Number(v.slice(1))), 0), 'a new id is fresh');
            for (const id of have) everSeen.add(id);
            doc = freeze(r.doc);
        }
    }
});

test('hostile arguments never throw and never corrupt the document', () => {
    const { doc, made } = build(2);
    const junk = [null, undefined, 0, -1, NaN, '', 'x', '__proto__', 'constructor', {}, [], [[]], [null], [{ id: 's2' }], () => 1, Symbol.iterator.toString(), { toString() { throw new Error('x'); } }];
    for (const j of junk) {
        for (const r of [
            () => O.remove(doc, j), () => O.group(doc, j), () => O.ungroup(doc, j), () => O.reorder(doc, j, 'front'), () => O.reorder(doc, made, j),
            () => O.transform(doc, j, M.translate(1, 1)), () => O.transform(doc, made, j), () => O.move(doc, j), () => O.move(doc, made, { parent: j, index: j }),
            () => O.insert(doc, j), () => O.insert(doc, rectSpec(), { parent: j, index: j }), () => O.setAttrs(doc, j, { fill: 'red' }), () => O.setAttrs(doc, made[0], j),
            () => O.setAttrs(doc, made[0], { [typeof j === 'string' ? j : 'x']: 1 }),
        ]) {
            let out;
            assert.doesNotThrow(() => { out = r(); });
            valid(out.doc);
            assert.ok(Array.isArray(out.problems) && Array.isArray(out.ids));
        }
    }
    const evil = JSON.parse('{"__proto__":{"polluted":1}}');
    O.setAttrs(doc, made[0], evil); O.insert(doc, { type: 'rect', attrs: evil });
    assert.equal({}.polluted, undefined);
});

test('performance (reported, generous bounds): 1,000 inserts, a group and a transform of 1,000 nodes', () => {
    let doc = createSvgDoc({ width: 500, height: 500 });
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) doc = O.insert(doc, rectSpec(i)).doc;
    const t1 = performance.now();
    const all = kids(doc);
    const g = O.group(doc, all);
    const moved = O.transform(g.doc, g.ids, M.translate(1, 1));
    const t2 = performance.now();
    assert.equal(stats(moved.doc).nodes, 1002);
    console.log(`svg ops: 1000 inserts ${(t1 - t0).toFixed(0)} ms, group + transform of 1000 nodes ${(t2 - t1).toFixed(0)} ms`);
    assert.ok(t1 - t0 < 5000 && t2 - t1 < 2000);
});
