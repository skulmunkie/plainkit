// Tests for the data table logic (sorting, filtering, selection, paging). Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortKey, sortRows, filterRows } from './table.js';

test('sortKey reads numbers through currency, dates, and folds text', () => {
    assert.equal(sortKey('$1,204.50', 'number'), 1204.5);
    assert.equal(sortKey(7, 'number'), 7);
    assert.equal(sortKey('n/a', 'number'), Number.NEGATIVE_INFINITY);
    assert.ok(sortKey('2026-01-07', 'date') < sortKey('2026-03-01', 'date'));
    assert.equal(sortKey('Alpha', 'text'), 'alpha');
    assert.equal(sortKey(null), '');
});

const rows = [{ id: 1, t: 'b', p: '$10' }, { id: 2, t: 'a', p: '$2' }, { id: 3, t: 'c', p: '$5' }];

test('sortRows sorts by a typed column without touching the input', () => {
    assert.deepEqual(sortRows(rows, { key: 'p', type: 'number' }).map(r => r.id), [2, 3, 1]);
    assert.deepEqual(sortRows(rows, { key: 't' }, 'descending').map(r => r.id), [3, 1, 2]);
    assert.deepEqual(rows.map(r => r.id), [1, 2, 3]);
    assert.deepEqual(sortRows(rows, null).map(r => r.id), [1, 2, 3]);
});

test('filterRows needs every active filter to match and ignores empty ones', () => {
    assert.deepEqual(filterRows(rows, { t: 'A' }).map(r => r.id), [2]);
    assert.deepEqual(filterRows(rows, { t: '', p: '$' }).map(r => r.id), [1, 2, 3]);
    assert.deepEqual(filterRows(rows, { t: 'a', p: '$10' }).map(r => r.id), []);
    assert.deepEqual(filterRows(rows, undefined).length, 3);
});


test('sortRows is stable, numeric-aware for text, and reverses', () => {
    const r = [{ id: 1, t: 'item 10' }, { id: 2, t: 'item 2' }, { id: 3, t: 'item 2' }];
    assert.deepEqual(sortRows(r, { key: 't' }).map(x => x.id), [2, 3, 1]);
    assert.deepEqual(sortRows(r, { key: 't' }, 'descending').map(x => x.id), [1, 2, 3]);
});
