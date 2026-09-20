// Tests for the chart geometry and the table-to-svg builder. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, el } from '../../tests/fake-dom.mjs';
import { niceMax, ticksFor, barRects, linePoints, donutSegments, sparkPoints, describeChart, buildChart, PLOT } from './chart.js';

test('niceMax rounds up to 1, 2, 5 or 10 times a power of ten', () => {
    assert.equal(niceMax(0), 1);
    assert.equal(niceMax(7), 10);
    assert.equal(niceMax(23), 50);
    assert.equal(niceMax(101), 200);
    assert.equal(niceMax(0.3), 0.5);
    assert.equal(niceMax(50), 50);
});

test('ticksFor spans zero to the max in equal steps', () => assert.deepEqual(ticksFor(100), [0, 25, 50, 75, 100]));

test('barRects stay inside the plot and scale to the axis maximum', () => {
    const { max, rects } = barRects([[10, 40, 25]]);
    assert.equal(max, 50);
    assert.equal(rects.length, 3);
    const floor = PLOT.h - PLOT.bottom;
    for (const b of rects) { assert.ok(b.x >= PLOT.left && b.x + b.width <= PLOT.w - PLOT.right); assert.equal(Math.round((b.y + b.height) * 10) / 10, floor); }
    assert.ok(rects[1].height > rects[0].height && rects[1].height > rects[2].height);
});

test('grouped bars share a band without overlapping', () => {
    const { rects } = barRects([[5, 5], [10, 10]]);
    const first = rects.filter(r => r.i === 0);
    assert.equal(first.length, 2);
    assert.ok(first[0].x + first[0].width <= first[1].x + 0.11);
});

test('negative values are drawn as zero height, never below the axis', () => {
    assert.equal(barRects([[-5, 5]]).rects[0].height, 0);
});

test('linePoints put a point at the centre of each band, higher values higher up', () => {
    const { lines } = linePoints([[1, 3, 2]]);
    assert.equal(lines[0].length, 3);
    assert.ok(lines[0][1][1] < lines[0][0][1]);
    assert.ok(lines[0][0][0] < lines[0][1][0] && lines[0][1][0] < lines[0][2][0]);
});

test('donutSegments add up to a full circle and start at twelve o\'clock', () => {
    const s = donutSegments([50, 30, 20]);
    assert.equal(s.reduce((a, x) => a + x.len, 0), 100);
    assert.equal(s[0].offset, 25);
    assert.equal(s[1].offset, -25);
    assert.equal(s[0].dash, '50 50');
    assert.deepEqual(donutSegments([0, 0]).map(x => x.len), [0, 0]);
});

test('sparkPoints scale to the box and cope with one value or none', () => {
    const pts = sparkPoints([1, 5, 3]).split(' ').map(p => p.split(',').map(Number));
    assert.equal(pts.length, 3);
    assert.equal(pts[0][0], 2);
    assert.equal(pts[2][0], 98);
    assert.ok(pts[1][1] < pts[0][1]);
    assert.equal(sparkPoints([]), '');
    assert.equal(sparkPoints([4]).split(' ').length, 1);
});

test('describeChart names the kind and reads the values, truncating long series', () => {
    assert.equal(describeChart('Bar', ['Jan', 'Feb'], ['Sales'], [[4, 6]]), 'Bar chart. Jan 4, Feb 6');
    assert.match(describeChart('Line', ['a', 'b'], ['X', 'Y'], [[1, 2], [3, 4]]), /X: a 1, b 2\. Y: a 3, b 4/);
    assert.match(describeChart('Bar', Array.from({ length: 20 }, (_, i) => `m${i}`), ['S'], [Array(20).fill(1)]), /and more$/);
});

test('buildChart makes a labelled svg with one rect per value, a legend for several series, and no style attribute', () => {
    const doc = createDocument();
    const make = tag => doc.createElement(tag);
    const { svg, legend } = buildChart('bar', { labels: ['A', 'B'], names: ['X', 'Y'], series: [[1, 2], [2, 3]] }, make);
    assert.equal(svg.getAttribute('role'), 'img');
    assert.match(svg.getAttribute('aria-label'), /Bar chart/);
    assert.equal(svg.children.filter(c => c.tagName === 'RECT').length, 4);
    assert.equal(legend.length, 2);
    const walk = n => [n, ...n.children.flatMap(walk)];
    assert.ok(!walk(svg).some(n => n.hasAttribute('style')));
    const donut = buildChart('donut', { labels: ['a', 'b', 'c'], names: ['S'], series: [[1, 1, 2]] }, make);
    assert.equal(donut.svg.children.filter(c => c.getAttribute('class')?.includes('chart-donut-seg')).length, 3);
    assert.equal(donut.legend.length, 3);
    assert.equal(buildChart('spark', { labels: ['a'], names: ['S'], series: [[1, 2, 3]] }, make).legend, null);
});
