// Tests for the pure selection geometry of pk-canvas (js/canvas-geometry.js, #430 phase C3) and the rule that the lazy layers are never imported statically.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRect, declaredRect, between, overlaps, contains, marquee, combine, toFrame, fromFrame, moved, nudge } from '../js/canvas-geometry.js';

test('readRect needs four finite numbers', () => {
    assert.deepEqual(readRect({ x: '10', y: '20', w: '30', h: '40' }), { x: 10, y: 20, w: 30, h: 40 });
    assert.equal(readRect({ x: '10', y: '20', w: '30' }), null);
    assert.equal(readRect({ x: 'a', y: '20', w: '30', h: '40' }), null);
    assert.equal(readRect({}), null);
});

test('declaredRect reads the dataset first and an SVG child\'s own attributes second', () => {
    assert.deepEqual(declaredRect({ dataset: { x: '1', y: '2', w: '3', h: '4' } }), { x: 1, y: 2, w: 3, h: 4 });
    const svg = { dataset: {}, getAttribute: n => ({ x: '5', y: '6', width: '7', height: '8' })[n] ?? null };
    assert.deepEqual(declaredRect(svg), { x: 5, y: 6, w: 7, h: 8 });
    assert.equal(declaredRect({ dataset: {}, getAttribute: () => null }), null);
});

test('between is the same rect whichever way the drag went', () => {
    assert.deepEqual(between(10, 10, 30, 50), { x: 10, y: 10, w: 20, h: 40 });
    assert.deepEqual(between(30, 50, 10, 10), { x: 10, y: 10, w: 20, h: 40 });
});

test('overlaps ignores touching edges; contains needs the whole rect', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    assert.ok(overlaps(a, { x: 5, y: 5, w: 10, h: 10 }));
    assert.ok(!overlaps(a, { x: 10, y: 0, w: 5, h: 5 }));
    assert.ok(contains(a, { x: 1, y: 1, w: 8, h: 8 }) && !contains(a, { x: 5, y: 5, w: 10, h: 10 }));
});

test('a marquee over everything selects everything, over nothing selects nothing, and "inside" needs the whole item', () => {
    const items = [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', x: 50, y: 50, w: 10, h: 10 }, { id: 'c', x: 100, y: 0, w: 10, h: 10 }];
    assert.deepEqual(marquee(items, { x: -5, y: -5, w: 500, h: 500 }), ['a', 'b', 'c']);
    assert.deepEqual(marquee(items, { x: 20, y: 20, w: 5, h: 5 }), []);
    assert.deepEqual(marquee(items, { x: 5, y: 5, w: 50, h: 50 }), ['a', 'b']);
    assert.deepEqual(marquee(items, { x: 5, y: 5, w: 50, h: 50 }, true), []);
});

test('combine replaces, or toggles when additive', () => {
    assert.deepEqual(combine(['a'], ['b', 'b'], false), ['b']);
    assert.deepEqual(combine(['a', 'b'], ['b', 'c'], true), ['a', 'c']);
    assert.deepEqual(combine([], [], true), []);
});

test('toFrame and fromFrame are inverses for a view', () => {
    const v = { x: 30, y: -20, zoom: 2.5 }, r = { x: 12, y: 7, w: 40, h: 9 };
    assert.deepEqual(toFrame(v, r), { x: 60, y: -2.5, w: 100, h: 22.5 });
    const back = fromFrame(v, toFrame(v, r));
    for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(back[k] - r[k]) < 1e-9);
});

test('moved: the selected items at their new positions, in item order (#430 C4)', () => {
    const items = [{ id: 'a', x: 1, y: 2, w: 5, h: 5 }, { id: 'b', x: 10, y: 20, w: 5, h: 5 }];
    assert.deepEqual(moved(items, ['b', 'a'], 3, -2), [{ id: 'a', x: 4, y: 0 }, { id: 'b', x: 13, y: 18 }]);
    assert.deepEqual(moved(items, ['nope'], 1, 1), []);
});

test('nudge: a grid step, ten with Shift, one screen pixel with Alt, 1 without a grid', () => {
    assert.equal(nudge(10, 2), 10);
    assert.equal(nudge(10, 2, { shiftKey: true }), 100);
    assert.equal(nudge(10, 2, { altKey: true }), 0.5);
    assert.equal(nudge(0, 1), 1);
});

test('pk-canvas loads its layers on first use: no static import of any canvas-* module, and none reaches into the element layer', () => {
    const src = fs.readFileSync(new URL('../components/canvas/canvas.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /^import .*canvas-(select|geometry|rulers|style)/m);
    assert.match(src, /import\('\.\.\/\.\.\/js\/canvas-select\.js'\)/);
    for (const f of ['canvas-select', 'canvas-geometry', 'canvas-rulers', 'canvas-style']) assert.doesNotMatch(fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8'), /from '\.\.\/(components|elements|pages|shells)\//);
});
