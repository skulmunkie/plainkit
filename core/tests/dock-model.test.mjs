// The dock-tree model (js/dock-model.js): the layout, its operations, the invariants after every one, and fromJson on hostile input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLayout, emptyLayout, validate, resize, activate, moveTab, dockPanel, collapsePanel, expandPanel, toJson, fromJson, groups, findGroup, panelIds, LIMITS, floatPanel, dockFloating, moveFloater, resizeFloater, raiseFloater, floaters, findFloater, isEdgeGroup } from '../js/dock-model.js';

const P = [{ id: 'tools', group: 'left' }, { id: 'assets', group: 'left' }, { id: 'canvas' }, { id: 'props', group: 'right' }, { id: 'log', group: 'bottom' }];
const ids = P.map(p => p.id);
const fresh = () => defaultLayout(P);

test('defaultLayout builds left | center | right with a bottom group and is valid', () => {
    const d = fresh();
    assert.deepEqual(validate(d, ids), []);
    assert.equal(d.root.type, 'split'); assert.equal(d.root.orientation, 'vertical');
    assert.deepEqual(groups(d).map(g => g.panels), [['tools', 'assets'], ['canvas'], ['props'], ['log']]);
    assert.equal(d.root.a.size, 20);
});

test('defaultLayout leaves out empty sides and handles no panels', () => {
    const one = defaultLayout([{ id: 'a' }]);
    assert.equal(one.root.type, 'tabs'); assert.deepEqual(validate(one, ['a']), []);
    assert.equal(defaultLayout([]).root, null);
    assert.deepEqual(validate(emptyLayout(), []), []);
});

test('resize clamps to min and max, is a no-op for the same size and reports an unknown split', () => {
    const d = fresh(), s = d.root.a.id;
    assert.equal(resize(d, { split: s, size: 40 }).doc.root.a.size, 40);
    assert.equal(resize(d, { split: s, size: 1 }).doc.root.a.size, 5);
    assert.equal(resize(d, { split: s, size: 500 }).doc.root.a.size, 95);
    assert.equal(resize(d, { split: s, size: 20 }).doc, d);
    const bad = resize(d, { split: 'd999', size: 40 });
    assert.equal(bad.doc, d); assert.equal(bad.problems[0].code, 'unknown-split');
    assert.equal(resize(d, { split: findGroup(d, 'canvas').id, size: 40 }).problems[0].code, 'unknown-split', 'a group is not a split');
});

test('operations do not mutate their input and share the branches they did not touch', () => {
    const d = fresh(), before = JSON.stringify(d), s = d.root.a.id;
    const r = resize(d, { split: s, size: 33 }).doc;
    assert.equal(JSON.stringify(d), before);
    assert.equal(r.root.b, d.root.b, 'the bottom group is the same object');
});

test('activate makes a panel the active tab of its group', () => {
    const d = fresh();
    assert.equal(findGroup(activate(d, { panel: 'assets' }).doc, 'assets').active, 'assets');
    assert.equal(activate(d, { panel: 'tools' }).doc, d);
    assert.equal(activate(d, { panel: 'nope' }).problems[0].code, 'unknown-panel');
});

test('moveTab reorders inside a group and moves between groups, collapsing the group it empties', () => {
    const d = fresh(), g = findGroup(d, 'tools').id;
    const swapped = moveTab(d, { panel: 'tools', group: g, index: 1 }).doc;
    assert.deepEqual(findGroup(swapped, 'tools').panels, ['assets', 'tools']);
    const to = findGroup(d, 'canvas').id, moved = moveTab(d, { panel: 'props', group: to }).doc;
    assert.deepEqual(findGroup(moved, 'canvas').panels, ['canvas', 'props']);
    assert.equal(findGroup(moved, 'canvas').active, 'props');
    assert.equal(groups(moved).length, 3, 'the empty group is gone and its split collapsed');
    assert.deepEqual(validate(moved, ids), []);
    assert.equal(moveTab(d, { panel: 'tools', group: 'd999' }).problems[0].code, 'unknown-group');
    assert.equal(moveTab(d, { panel: 'x', group: g }).problems[0].code, 'unknown-panel');
});

test('moving the active tab out makes a neighbour active', () => {
    const d = activate(fresh(), { panel: 'assets' }).doc;
    const m = moveTab(d, { panel: 'assets', group: findGroup(d, 'canvas').id }).doc;
    assert.equal(findGroup(m, 'tools').active, 'tools');
});

test('dockPanel splits the target on each edge, in the right order and orientation, or joins it in the centre', () => {
    const d = fresh(), target = findGroup(d, 'canvas').id;
    for (const [zone, orientation, first] of [['left', 'horizontal', 'props'], ['right', 'horizontal', 'canvas'], ['top', 'vertical', 'props'], ['bottom', 'vertical', 'canvas']]) {
        const r = dockPanel(d, { panel: 'props', target, zone });
        assert.deepEqual(r.problems, [], zone);
        const s = findGroup(r.doc, 'canvas'), parent = [];
        const find = n => { if (n.type === 'split') { if (n.a === s || n.b === s) parent.push(n); find(n.a); find(n.b); } };
        find(r.doc.root);
        assert.equal(parent[0].orientation, orientation, zone); assert.equal(parent[0].size, 50);
        assert.equal(parent[0].a.panels[0], first, zone);
        assert.deepEqual(validate(r.doc, ids), [], zone);
    }
    assert.deepEqual(findGroup(dockPanel(d, { panel: 'props', target, zone: 'center' }).doc, 'canvas').panels, ['canvas', 'props']);
});

test('dockPanel refuses a panel beside its own single-panel group, an unknown zone, target or panel', () => {
    const d = fresh(), own = findGroup(d, 'canvas').id;
    assert.equal(dockPanel(d, { panel: 'canvas', target: own, zone: 'left' }).problems[0].code, 'self');
    assert.equal(dockPanel(d, { panel: 'props', target: own, zone: 'diagonal' }).problems[0].code, 'unknown-zone');
    assert.equal(dockPanel(d, { panel: 'props', target: 'zzz', zone: 'left' }).problems[0].code, 'unknown-group');
    assert.equal(dockPanel(d, { panel: 'zzz', target: own, zone: 'left' }).problems[0].code, 'unknown-panel');
    // A panel of a multi-panel group can be split off beside its own group.
    const g = findGroup(d, 'tools'), r = dockPanel(d, { panel: 'tools', target: g.id, zone: 'right' });
    assert.deepEqual(r.problems, []); assert.deepEqual(validate(r.doc, ids), []);
});

test('isEdgeGroup: a left or right column is an edge group, the centre and a full-width bottom bar are not', () => {
    const d = fresh(); // left [tools, assets] | centre canvas | right props, bottom log
    assert.equal(isEdgeGroup(d, findGroup(d, 'tools').id), true, 'left column');
    assert.equal(isEdgeGroup(d, findGroup(d, 'props').id), true, 'right column');
    assert.equal(isEdgeGroup(d, findGroup(d, 'canvas').id), false, 'centre column, boxed in on both sides');
    assert.equal(isEdgeGroup(d, findGroup(d, 'log').id), false, 'a full-width bottom bar is never beside another column');
    assert.equal(isEdgeGroup(d, 'no-such-id'), false, 'an unknown id is never an edge group');
    const one = defaultLayout([{ id: 'a' }]);
    assert.equal(isEdgeGroup(one, one.root.id), false, 'the sole group has no horizontal sibling to be an edge beside');
});

test('collapsePanel folds a panel and expandPanel restores it, both idempotent and total', () => {
    const d = fresh();
    const c = collapsePanel(d, { panel: 'canvas' });
    assert.deepEqual(c.doc.collapsed, ['canvas']); assert.deepEqual(c.problems, []); assert.deepEqual(validate(c.doc, ids), []);
    assert.equal(collapsePanel(c.doc, { panel: 'canvas' }).doc, c.doc, 'collapsing an already-collapsed panel is a no-op');
    const e = expandPanel(c.doc, { panel: 'canvas' });
    assert.deepEqual(e.doc.collapsed, []); assert.deepEqual(e.problems, []);
    assert.equal(expandPanel(d, { panel: 'canvas' }).doc, d, 'expanding an already-open panel is a no-op');
    assert.equal(expandPanel(d, { panel: 'zzz' }).doc, d, 'expanding an unknown panel is a no-op, not a problem');
    const bad = collapsePanel(d, { panel: 'zzz' });
    assert.equal(bad.doc, d); assert.equal(bad.problems[0].code, 'unknown-panel');
    assert.deepEqual(collapsePanel(d, { panel: 'tools' }).doc.collapsed, ['tools'], 'a panel in a multi-panel group can also be marked collapsed in the model');
});

test('collapsed is dropped for a panel that moves out or is no longer declared, and round-trips through toJson/fromJson', () => {
    let d = collapsePanel(fresh(), { panel: 'props' }).doc;
    assert.deepEqual(fromJson(toJson(d), { panels: P }).doc, d, 'round trip keeps collapsed');
    const removed = fromJson(toJson(d), { panels: P.filter(p => p.id !== 'props') });
    assert.deepEqual(removed.doc.collapsed, [], 'a panel that leaves the declared set also leaves collapsed');
    assert.deepEqual(validate(removed.doc, ids.filter(i => i !== 'props')), []);
});

test('validate flags a stale or malformed collapsed list', () => {
    const d = fresh();
    assert.deepEqual(validate({ ...d, collapsed: undefined }, ids).map(p => p.code), ['shape']);
    assert.deepEqual(validate({ ...d, collapsed: ['canvas', 'canvas'] }, ids).map(p => p.code), ['collapsed-twice']);
    assert.deepEqual(validate({ ...d, collapsed: ['ghost'] }, ids).map(p => p.code), ['collapsed-unknown']);
});

test('the last group is removed cleanly: the root becomes null', () => {
    let d = defaultLayout([{ id: 'a' }, { id: 'b' }]);
    assert.equal(d.root.type, 'tabs');
    d = dockPanel(d, { panel: 'a', target: d.root.id, zone: 'right' }).doc;
    assert.equal(d.root.type, 'split');
    d = moveTab(d, { panel: 'a', group: findGroup(d, 'b').id }).doc;
    assert.equal(d.root.type, 'tabs'); assert.deepEqual(d.root.panels, ['b', 'a']);
});

test('a limit is a problem and the unchanged document', () => {
    const many = Array.from({ length: LIMITS.depth + 5 }, (_, i) => ({ id: `p${i}` }));
    let d = defaultLayout(many), refused = null;
    for (let i = 1; i < many.length && !refused; i++) {
        const r = dockPanel(d, { panel: `p${i}`, target: findGroup(d, 'p0').id, zone: 'right' });
        if (r.problems.length) { refused = r; assert.equal(r.doc, d); } else d = r.doc;
    }
    assert.equal(refused?.problems[0].code, 'limit');
    assert.deepEqual(validate(d, many.map(p => p.id)), []);
});

test('toJson and fromJson round-trip a layout, including one edited by operations', () => {
    let d = fresh();
    d = dockPanel(d, { panel: 'props', target: findGroup(d, 'canvas').id, zone: 'bottom' }).doc;
    d = resize(d, { split: d.root.a.id, size: 33.3 }).doc;
    d = activate(d, { panel: 'assets' }).doc;
    const back = fromJson(toJson(d), { panels: P });
    assert.deepEqual(back.problems, []);
    assert.deepEqual(back.doc, d);
    assert.deepEqual(fromJson(JSON.parse(toJson(d)), { panels: P }).doc, d, 'an object works like a string');
});

test('fromJson on unusable input gives the default layout and a problem, never a throw', () => {
    const def = fresh();
    for (const bad of ['', '{', 'null', '[]', '42', '"x"', null, undefined, 7, [], { version: 2, root: null }, { version: 1 }, 'x'.repeat(LIMITS.bytes + 1)]) {
        const r = fromJson(bad, { panels: P });
        assert.deepEqual(r.doc.version === 1 && validate(r.doc, ids), [], JSON.stringify(bad)?.slice(0, 20));
        assert.ok(r.problems.length > 0);
    }
    assert.deepEqual(fromJson('{', { panels: P }).doc, def);
});

test('fromJson rebuilds from known fields only: unknown keys, wrong types and bad numbers are repaired', () => {
    const hostile = { version: 1, seq: 'x', evil: '<script>', root: { id: '<b>', type: 'split', orientation: 'diagonal', size: 'big', min: 'a', max: -5, a: { type: 'tabs', panels: ['tools', 'tools', 'ghost', 7, null], active: 'zzz', html: 'x' }, b: { type: 'tabs', panels: ['canvas', 'props', 'log', 'assets'] }, extra: 1 } };
    const { doc, problems } = fromJson(hostile, { panels: P });
    assert.deepEqual(validate(doc, ids), []);
    assert.deepEqual(problems, [], 'every panel is still placed, so nothing is worth a warning');
    assert.equal(JSON.stringify(doc).includes('script'), false); assert.equal(JSON.stringify(doc).includes('ghost'), false);
    assert.equal(doc.root.orientation, 'horizontal');
    assert.equal(doc.root.a.active, 'tools');
});

test('fromJson drops removed panels, appends added ones, and drops empty groups', () => {
    const d = fresh();
    const removed = fromJson(toJson(d), { panels: P.filter(p => p.id !== 'props') });
    assert.deepEqual(validate(removed.doc, ids.filter(i => i !== 'props')), []);
    assert.equal(groups(removed.doc).length, 3, 'the props group went with its panel');
    const added = fromJson(toJson(d), { panels: [...P, { id: 'extra' }] });
    assert.deepEqual(validate(added.doc, [...ids, 'extra']), []);
    assert.ok(added.problems.some(p => p.code === 'panel-added'));
    assert.deepEqual(findGroup(added.doc, 'extra').panels.slice(0, 2), ['tools', 'assets']);
});

test('fromJson caps depth and repeats of an id, and gives every node a unique id above seq', () => {
    let node = { type: 'tabs', panels: ['tools'] };
    for (let i = 0; i < 40; i++) node = { id: 'd1', type: 'split', size: 50, a: node, b: { id: 'd1', type: 'tabs', panels: [`x${i}`] } };
    const r = fromJson({ version: 1, root: node }, { panels: P });
    assert.deepEqual(validate(r.doc, ids), []);
    const all = []; const walk = n => { all.push(n.id); if (n.type === 'split') { walk(n.a); walk(n.b); } }; walk(r.doc.root);
    assert.equal(new Set(all).size, all.length);
});

test('floatPanel lifts a panel into a new floater inside the given bounds, and dockFloating returns it to the tree', () => {
    const d = fresh();
    const f = floatPanel(d, { panel: 'assets', rect: { x: -10, y: 9999, w: 50, h: 900 }, bounds: { w: 400, h: 300 } });
    assert.deepEqual(f.problems, []);
    assert.deepEqual(validate(f.doc, ids), []);
    assert.equal(findGroup(f.doc, 'assets'), null, 'no longer in the tree');
    assert.equal(floaters(f.doc).length, 1);
    const fl = floaters(f.doc)[0];
    assert.equal(fl.x, 0, 'clamped into bounds'); assert.equal(fl.w, 120, 'held to the minimum width'); assert.equal(fl.h, 300, 'clamped to bounds height');
    assert.deepEqual(fl.group.panels, ['assets']);

    const back = dockFloating(f.doc, { floater: fl.id, target: findGroup(f.doc, 'canvas').id, zone: 'right' });
    assert.deepEqual(back.problems, []);
    assert.deepEqual(validate(back.doc, ids), []);
    assert.equal(floaters(back.doc).length, 0);
    assert.deepEqual(findGroup(back.doc, 'assets').panels, ['assets']);

    const center = dockFloating(f.doc, { floater: fl.id, target: findGroup(f.doc, 'canvas').id, zone: 'center' });
    assert.deepEqual(findGroup(center.doc, 'canvas').panels, ['canvas', 'assets']);
    assert.equal(floaters(center.doc).length, 0);
});

test('floatPanel and dockFloating report unknown ids without mutating the document', () => {
    const d = fresh();
    assert.equal(floatPanel(d, { panel: 'zzz', rect: {} }).problems[0].code, 'unknown-panel');
    assert.equal(dockFloating(d, { floater: 'zzz', target: findGroup(d, 'canvas').id, zone: 'left' }).problems[0].code, 'unknown-floater');
    const f = floatPanel(d, { panel: 'assets', rect: {} }).doc;
    assert.equal(dockFloating(f, { floater: findFloater(f, floaters(f)[0].id).id, target: 'zzz', zone: 'left' }).problems[0].code, 'unknown-group');
    assert.equal(dockFloating(f, { floater: floaters(f)[0].id, target: findGroup(f, 'canvas').id, zone: 'diagonal' }).problems[0].code, 'unknown-zone');
});

test('moveFloater, resizeFloater and raiseFloater clamp and report unknown floaters', () => {
    let d = floatPanel(fresh(), { panel: 'assets', rect: { x: 10, y: 10, w: 200, h: 150 }, bounds: { w: 400, h: 300 } }).doc;
    const id = floaters(d)[0].id;
    d = moveFloater(d, { floater: id, x: 390, y: 290, bounds: { w: 400, h: 300 } }).doc;
    assert.equal(findFloater(d, id).x, 200, 'moved but held inside the bounds given its width');
    d = resizeFloater(d, { floater: id, w: 1000, h: 1000, bounds: { w: 400, h: 300 } }).doc;
    assert.equal(findFloater(d, id).w, 400); assert.equal(findFloater(d, id).h, 300);
    const raised = raiseFloater(d, { floater: id });
    assert.equal(raised.doc, d, 'already the only, topmost floater');
    assert.equal(moveFloater(d, { floater: 'zzz', x: 0, y: 0 }).problems[0].code, 'unknown-floater');
    assert.equal(resizeFloater(d, { floater: 'zzz', w: 10, h: 10 }).problems[0].code, 'unknown-floater');
    assert.equal(raiseFloater(d, { floater: 'zzz' }).problems[0].code, 'unknown-floater');
});

test('activate reaches a panel in a floater (a no-op path is a no-op), and toJson/fromJson round-trips two floaters', () => {
    let d = floatPanel(fresh(), { panel: 'assets', rect: { x: 5, y: 5, w: 150, h: 150 } }).doc;
    d = floatPanel(d, { panel: 'props', rect: { x: 20, y: 20, w: 150, h: 150 } }).doc;
    assert.equal(floaters(d).length, 2);
    assert.equal(activate(d, { panel: 'assets' }).doc, d, 'already the active (only) panel of its floater');
    assert.deepEqual(validate(d, ids), []);
    const back = fromJson(toJson(d), { panels: P });
    assert.deepEqual(back.problems, []);
    assert.deepEqual(back.doc, d);
});

test('fromJson drops a malformed floater without failing the rest of the layout, and caps their count', () => {
    const d = fresh();
    const withBad = { ...JSON.parse(toJson(d)), floating: [{ id: 'd1', x: 0, y: 0, w: 10, h: 10, z: 1, group: { type: 'tabs', panels: ['tools'] } }, { not: 'a floater' }, null] };
    const r = fromJson(withBad, { panels: P });
    assert.deepEqual(validate(r.doc, ids), []);
    assert.ok(r.problems.some(p => p.code === 'repaired'));
    const many = { version: 1, seq: 1, root: { id: 'd1', type: 'tabs', panels: ['canvas'] }, floating: Array.from({ length: LIMITS.floaters + 5 }, (_, i) => ({ id: `d${100 + i * 2}`, x: 0, y: 0, w: 10, h: 10, z: 1, group: { id: `d${101 + i * 2}`, type: 'tabs', panels: [P[i % P.length].id] } })) };
    const capped = fromJson(many, { panels: P });
    assert.ok(floaters(capped.doc).length <= LIMITS.floaters);
    assert.deepEqual(validate(capped.doc, ids), []);
});

test('a randomised sequence of operations keeps every invariant (seeded)', () => {
    let seed = 12345;
    const rnd = n => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n; };
    let d = fresh();
    for (let i = 0; i < 400; i++) {
        const gs = groups(d), panel = ids[rnd(ids.length)], g = gs[rnd(gs.length)];
        const op = rnd(5);
        const r = op === 0 ? resize(d, { split: `d${rnd(d.seq + 3)}`, size: rnd(140) - 20 })
            : op === 1 ? activate(d, { panel })
            : op === 2 ? moveTab(d, { panel, group: g.id, index: rnd(4) })
            : op === 3 ? dockPanel(d, { panel, target: g.id, zone: ['left', 'right', 'top', 'bottom'][rnd(4)] })
            : dockPanel(d, { panel, target: rnd(9) ? g.id : 'zz', zone: ['center', 'bogus'][rnd(2)] });
        d = r.doc;
        assert.deepEqual(validate(d, ids), [], `after step ${i}`);
        assert.equal(panelIds(d).length, ids.length);
        assert.deepEqual(fromJson(toJson(d), { panels: P }).doc, d, `round trip after step ${i}`);
    }
});
