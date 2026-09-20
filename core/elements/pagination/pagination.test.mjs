// Tests for the pagination logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampPage, pageCount, pageWindow, pageRange, pageForKey } from './pagination.js';

test('pageCount rounds up and is never below one', () => {
    assert.equal(pageCount(95, 10), 10);
    assert.equal(pageCount(0, 10), 1);
    assert.equal(pageCount(10, 10), 1);
});

test('clampPage keeps a page inside 1..pages and survives junk', () => {
    assert.equal(clampPage(0, 5), 1);
    assert.equal(clampPage(9, 5), 5);
    assert.equal(clampPage('x', 5), 1);
    assert.equal(clampPage(2.7, 5), 2);
});

test('pageWindow lists every page when they fit', () => {
    assert.deepEqual(pageWindow(3, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(pageWindow(1, 1), [1]);
    assert.deepEqual(pageWindow(1, 0), []);
});

test('pageWindow keeps a constant width with ellipses at the start, middle and end', () => {
    assert.deepEqual(pageWindow(1, 20), [1, 2, 3, 4, 5, 'gap', 20]);
    assert.deepEqual(pageWindow(10, 20), [1, 'gap', 9, 10, 11, 'gap', 20]);
    assert.deepEqual(pageWindow(20, 20), [1, 'gap', 16, 17, 18, 19, 20]);
    assert.equal(pageWindow(1, 20).length, pageWindow(10, 20).length);
});

test('pageWindow honours siblings and boundary', () => {
    assert.deepEqual(pageWindow(10, 30, { siblings: 2 }), [1, 'gap', 8, 9, 10, 11, 12, 'gap', 30]);
    assert.deepEqual(pageWindow(15, 30, { boundary: 2 }), [1, 2, 'gap', 14, 15, 16, 'gap', 29, 30]);
});

test('pageWindow always contains the current page and both ends', () => {
    for (const total of [6, 7, 8, 12, 50]) for (let c = 1; c <= total; c++) {
        const w = pageWindow(c, total);
        assert.ok(w.includes(c) && w.includes(1) && w.includes(total), `${c}/${total}: ${w}`);
        assert.ok(!w.some((x, i) => x === 'gap' && w[i + 1] === 'gap'));
    }
});

test('pageRange gives the first and last item on a page', () => {
    assert.deepEqual(pageRange(3, 10, 95), { from: 21, to: 30 });
    assert.deepEqual(pageRange(10, 10, 95), { from: 91, to: 95 });
    assert.deepEqual(pageRange(1, 10, 0), { from: 0, to: 0 });
});

test('pageForKey moves with arrows, Home and End and ignores other keys', () => {
    assert.equal(pageForKey(3, 10, 'ArrowRight'), 4);
    assert.equal(pageForKey(1, 10, 'ArrowLeft'), 1);
    assert.equal(pageForKey(3, 10, 'Home'), 1);
    assert.equal(pageForKey(3, 10, 'End'), 10);
    assert.equal(pageForKey(3, 10, 'a'), null);
});
