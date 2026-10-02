import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowId, rowIds, rowAt, idSet, toggleId, boxState, setPage } from '../js/rowset.js';

const rows = [{ id: 7, n: 'a' }, { n: 'b' }, { id: 'x', n: 'c' }];

test('a row id is its key as a string, or its position when the key is missing', () => {
    assert.deepEqual(rowIds(rows, 'id'), ['7', '1', 'x']);
    assert.equal(rowId({ id: 0 }, 5, 'id'), '0');
    assert.equal(rowId({ id: null }, 5, 'id'), '5');
});
test('rowAt finds the row of an id, or undefined', () => {
    const ids = rowIds(rows, 'id');
    assert.equal(rowAt(rows, ids, 'x'), rows[2]);
    assert.equal(rowAt(rows, ids, 'nope'), undefined);
});
test('toggling keeps row order, coerces numbers and drops ids that are not in the view', () => {
    const ids = ['1', '2', '3'];
    assert.deepEqual(toggleId(ids, ['3'], '1', true), ['1', '3']);
    assert.deepEqual(toggleId(ids, [2, '3'], '3', false), ['2']);
    assert.deepEqual(toggleId(ids, ['9', '2'], '1', true), ['1', '2']);
    assert.deepEqual([...idSet([1, '1'])], ['1']);
});
test('the select-all box is checked when all rows are selected and mixed when some are', () => {
    assert.deepEqual(boxState([], 3), { count: 0, checked: false, mixed: false });
    assert.deepEqual(boxState(['1'], 3), { count: 1, checked: false, mixed: true });
    assert.deepEqual(boxState(['1', '2', '3'], 3), { count: 3, checked: true, mixed: false });
    assert.deepEqual(boxState([], 0), { count: 0, checked: false, mixed: false });
});

// Selection across pages (#801): with keep, ids outside the loaded rows survive, because a manual table replaces its rows on every page.
test('keep: toggling and the page box leave the ids of other pages alone', () => {
    const ids = ['4', '5', '6'];
    assert.deepEqual(toggleId(ids, ['1', '5'], '4', true, true), ['1', '5', '4']);
    assert.deepEqual(toggleId(ids, ['1', '5'], '5', false, true), ['1']);
    assert.deepEqual(setPage(ids, ['1', '5'], true, true), ['1', '5', '4', '6']);
    assert.deepEqual(setPage(ids, ['1', '5'], false, true), ['1']);
    assert.deepEqual(setPage(ids, ['1', '5'], true, false), ['4', '5', '6'], 'without keep the page is the whole selection');
    assert.deepEqual(setPage(ids, ['1', '5'], false, false), []);
});
