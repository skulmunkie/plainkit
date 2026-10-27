// The dock layout history (#432 phase D3, js/dock-history.js): coalescing, no-ops, redo, cap, re-validation, and a seeded random walk undone to the start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDockHistory, recordLayout, undoLayout, redoLayout } from '../js/dock-history.js';
import { defaultLayout, resize, activate, collapsePanel, expandPanel, moveTab, fromJson, toJson, groups } from '../js/dock-model.js';
import { canUndo, canRedo, MAX_STEPS } from '../js/history.js';

const P = [{ id: 'tools', group: 'left' }, { id: 'assets', group: 'left' }, { id: 'canvas' }, { id: 'props', group: 'right' }, { id: 'log', group: 'bottom' }];
const start = () => defaultLayout(P);
const splitId = d => d.root.id;
const steps = h => { let n = 0; for (let x = h; canUndo(x); x = undoLayout(x).h) n++; return n; };

test('ten resizes with one key inside 800 ms are one undo step', () => {
    let h = createDockHistory(start()); const s = splitId(h.present);
    for (let i = 0; i < 10; i++) h = recordLayout(h, resize(h.present, { split: s, size: 30 + i }), { key: `resize:${s}`, at: 1000 + i * 50 });
    assert.equal(steps(h), 1);
    assert.equal(toJson(undoLayout(h).doc), toJson(start()));
});

test('a move then a close are two steps', () => {
    let h = createDockHistory(start());
    h = recordLayout(h, activate(h.present, { panel: 'assets' }), { at: 1 });
    h = recordLayout(h, collapsePanel(h.present, { panel: 'log' }), { at: 2 });
    assert.equal(steps(h), 2);
});

test('an operation with problems, or one that changes nothing, records nothing', () => {
    const h = createDockHistory(start());
    assert.equal(recordLayout(h, resize(h.present, { split: 'nope', size: 10 })), h);
    assert.equal(recordLayout(h, { doc: h.present, problems: [] }), h);
    assert.equal(recordLayout(h, { doc: { ...h.present, seq: 99 }, problems: [{ code: 'x' }] }), h);
});

test('undo then a new operation clears redo; redo returns the layout', () => {
    let h = createDockHistory(start());
    h = recordLayout(h, activate(h.present, { panel: 'assets' }), { at: 1 });
    const after = toJson(h.present);
    h = undoLayout(h).h; assert.ok(canRedo(h));
    assert.equal(toJson(redoLayout(h).doc), after);
    h = recordLayout(h, collapsePanel(h.present, { panel: 'log' }), { at: 2 });
    assert.ok(!canRedo(h));
});

test('the history is capped at MAX_STEPS', () => {
    let h = createDockHistory(start()); const s = splitId(h.present);
    for (let i = 0; i < MAX_STEPS + 20; i++) h = recordLayout(h, resize(h.present, { split: s, size: i % 2 ? 30 : 60 }), { at: i * 5000 });
    assert.equal(steps(h), MAX_STEPS);
});

test('what undo and redo return passes fromJson without problems', () => {
    let h = createDockHistory(start());
    h = recordLayout(h, activate(h.present, { panel: 'assets' }), { at: 1 });
    h = recordLayout(h, collapsePanel(h.present, { panel: 'log' }), { at: 2 });
    const u = undoLayout(h), r = redoLayout(u.h);
    for (const doc of [u.doc, r.doc]) assert.deepEqual(fromJson(doc, { panels: P }).problems, []);
});

test('an undo whose layout does not survive fromJson leaves the history unchanged', () => {
    const bad = { ...createDockHistory(start()), past: [{ version: 99 }] };
    bad.present = start();
    const r = undoLayout(bad);
    assert.equal(r.h, bad); assert.equal(r.doc, bad.present);
});

test('a seeded random sequence of operations, undone fully, equals the first layout', () => {
    let seed = 12345; const rnd = n => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n; };
    const first = start(); let h = createDockHistory(first); const ids = P.map(p => p.id);
    for (let i = 0; i < 60; i++) {
        const d = h.present, panel = ids[rnd(ids.length)], group = groups(d)[rnd(groups(d).length)].id;
        const ops = [() => resize(d, { split: splitId(d), size: 10 + rnd(80) }), () => activate(d, { panel }), () => collapsePanel(d, { panel }), () => expandPanel(d, { panel }), () => moveTab(d, { panel, group, index: rnd(3) })];
        h = recordLayout(h, ops[rnd(ops.length)](), { at: i * 5000 });
    }
    assert.ok(canUndo(h), 'the random walk changed something');
    while (canUndo(h)) h = undoLayout(h).h;
    assert.equal(toJson(h.present), toJson(first));
});
