// pk-heat-map (#1721, phase 1): the layout maths (js/heat-map-layout.js), the item reading and the css. The element itself is measured in a browser (core/tests/browser/cases-heat-map.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { layout, cleanItems, worstRatio, OTHER_ID } from '../../js/heat-map-layout.js';

const W = 400, H = 300;
const area = b => b.w * b.h;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const items = (...v) => v.map((value, i) => ({ id: `i${i}`, label: `Item ${i}`, value }));

test('no items, or only unusable ones, give no boxes', () => {
    assert.deepEqual(layout([], W, H), []);
    assert.deepEqual(layout(items(0, -3, Number.NaN, Infinity), W, H), []);
    assert.deepEqual(layout(items(1), 0, H), [], 'no room, no boxes');
});

test('one item fills the whole rectangle', () => {
    assert.deepEqual(layout(items(7), W, H).map(({ id, x, y, w, h }) => ({ id, x, y, w, h })), [{ id: 'i0', x: 0, y: 0, w: W, h: H }]);
});

test('the boxes tile the rectangle exactly: no overlap, no gap, nothing outside', () => {
    for (const vals of [[5, 3, 2], [40, 20, 10, 10, 5, 5, 5, 3, 2], Array.from({ length: 40 }, (_, i) => 1 + ((i * 7) % 13)), [1000, 1, 1, 1]]) {
        const boxes = layout(items(...vals), W, H);
        assert.equal(boxes.length, vals.length);
        assert.equal(boxes.reduce((s, b) => s + area(b), 0), W * H, `the areas add up to the rectangle for ${vals.length} items`);
        for (const b of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H, `${b.id} is inside`);
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i], boxes[j]), `${boxes[i].id} and ${boxes[j].id} overlap`);
    }
});

test('areas are proportional to the weights (within the rounding of whole pixels)', () => {
    const vals = [60, 25, 10, 5];
    const boxes = layout(items(...vals), W, H), total = vals.reduce((a, b) => a + b);
    boxes.forEach((b, i) => {
        const want = (vals[i] / total) * W * H;
        assert.ok(Math.abs(area(b) - want) <= (b.w + b.h), `item ${i}: ${area(b)} px against ${want} px`);
    });
});

test('boxes come largest first and ties keep the input order', () => {
    const boxes = layout([{ id: 'a', value: 2 }, { id: 'b', value: 9 }, { id: 'c', value: 2 }, { id: 'd', value: 2 }], W, H);
    assert.deepEqual(boxes.map(b => b.id), ['b', 'a', 'c', 'd']);
    assert.deepEqual(layout([{ id: 'a', value: 2 }, { id: 'b', value: 9 }, { id: 'c', value: 2 }, { id: 'd', value: 2 }], W, H), boxes, 'the same input gives the same output');
});

test('worstRatio is the squarified measure: a square row is 1, a sliver is large', () => {
    assert.equal(worstRatio([100], 10), 1);
    assert.ok(worstRatio([1, 99], 10) > worstRatio([50, 50], 10));
});

test('the squarified rows keep the boxes near square: the worst aspect ratio stays low for even weights', () => {
    const boxes = layout(items(...Array(12).fill(1)), 600, 400);
    for (const b of boxes) assert.ok(Math.max(b.w / b.h, b.h / b.w) <= 2.5, `${b.id} is ${b.w} by ${b.h}`);
});

test('a dominant item takes most of the area and the rest still tile', () => {
    const boxes = layout(items(900, 10, 10, 10), W, H);
    assert.ok(area(boxes[0]) > 0.9 * W * H);
    assert.equal(boxes.reduce((s, b) => s + area(b), 0), W * H);
});

test('boxes narrower than minBox are merged into one Other box, never dropped', () => {
    const vals = [500, 300, 100, 1, 1, 1, 1, 1];
    const plain = layout(items(...vals), W, H);
    assert.ok(plain.some(b => Math.min(b.w, b.h) < 48), 'the small ones are tiny without a minimum');
    const boxes = layout(items(...vals), W, H, { minBox: 48 });
    const other = boxes.find(b => b.id === OTHER_ID);
    assert.ok(other, 'there is an Other box');
    assert.ok(other.members.length >= 5, `the five small ones are in it (${other.members.length})`);
    assert.equal(other.value, other.members.reduce((s, m) => s + m.value, 0));
    assert.equal(boxes.reduce((s, b) => s + area(b), 0), W * H, 'still a full tiling');
    assert.equal(boxes.length + other.members.length - 1, vals.length, 'every item is in a box or in Other');
    for (const b of boxes) assert.ok(Math.min(b.w, b.h) >= 48, `${b.id} is ${b.w} by ${b.h}, under minBox`);
    assert.equal(boxes.at(-1).id, OTHER_ID, 'Other comes last');
});

test('a lone small box is merged with the next smallest one, so Other is bigger than the sliver', () => {
    const boxes = layout(items(1000, 100, 100, 1), W, H, { minBox: 48 });
    const other = boxes.find(b => b.id === OTHER_ID);
    assert.ok(other.members.length >= 2 && other.members.some(m => m.id === 'i3'));
    assert.equal(boxes.reduce((s, b) => s + area(b), 0), W * H);
});

test('a dominant item is never merged into Other to make room for a sliver', () => {
    const boxes = layout(items(900, 40, 30, 20), 375, 280, { minBox: 48 });
    assert.equal(boxes[0].id, 'i0');
    assert.equal(boxes[0].members, undefined);
    assert.ok(Math.min(boxes[0].w, boxes[0].h) > 200);
    assert.equal(boxes.reduce((s, b) => s + area(b), 0), 375 * 280);
});

test('minBox 0 never merges, and a very large minBox ends in one Other box rather than looping', () => {
    assert.ok(!layout(items(5, 5, 5, 1, 1, 1), W, H, { minBox: 0 }).some(b => b.id === OTHER_ID));
    const boxes = layout(items(5, 5, 5, 1, 1, 1), W, H, { minBox: 10000 });
    assert.equal(boxes.length, 1);
    assert.equal(boxes[0].id, OTHER_ID);
    assert.equal(boxes[0].w * boxes[0].h, W * H);
});

test('cleanItems keeps usable items in order, gives each an id and says what it dropped', () => {
    const dropped = [];
    const good = cleanItems([{ id: 'a', label: 'A', value: 3, severity: 'danger' }, { label: 'No id', value: 2 }, { id: 'z', value: 0 }, null, { id: 'n', value: '4' }, { id: 'x', value: 1, severity: 'bogus' }], m => dropped.push(m));
    assert.deepEqual(good.map(i => [i.id, i.label, i.value, i.severity]), [['a', 'A', 3, 'danger'], ['No id', 'No id', 2, 'neutral'], ['n', 'n', 4, 'neutral'], ['x', 'x', 1, 'neutral']]);
    assert.ok(dropped.length >= 3 && dropped.some(m => /value/.test(m)) && dropped.some(m => /severity/.test(m)), dropped.join(' | '));
    assert.deepEqual(cleanItems('not a list', () => {}), []);
});

test('the css uses tokens only: no colour or size literal outside the sr-only trick', () => {
    const css = fs.readFileSync(fileURLToPath(new URL('./heat-map.css', import.meta.url)), 'utf8');
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), 'no hex colour');
    assert.ok(!/\brgba?\(|\bhsla?\(/i.test(css), 'no rgb or hsl colour');
    assert.ok(!/\d\s*(px|rem|em)\b/.test(css.replace(/\b1px\b|--pk-heat-map-height, 20rem|@container \([^)]*\)/g, '')), 'no px, rem or em size other than the 1px hairline, the default height hook and the container-query thresholds');
});
