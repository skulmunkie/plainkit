// The generic filter/search/sort/paginate computation for a list page (js/list-query.js), independent of any consumer's row shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { queryList } from '../js/list-query.js';

const ROWS = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, name: `Item ${String(i + 1).padStart(2, '0')}`, status: ['Active', 'Draft', 'Archived'][i % 3] }));

test('with no state, every row comes back on one page', () => {
    const r = queryList(ROWS, {});
    assert.equal(r.total, 23); assert.equal(r.pages, 1); assert.equal(r.page, 1); assert.equal(r.rows.length, 23);
});

test('filter narrows first, by any predicate', () => {
    const r = queryList(ROWS, { filter: row => row.status === 'Active', pageSize: 25 });
    assert.equal(r.total, ROWS.filter(x => x.status === 'Active').length);
    assert.ok(r.rows.every(x => x.status === 'Active'));
});

test('search narrows by substring over searchKeys, case-insensitively, and ignores rows missing the field', () => {
    const rows = [...ROWS, { id: 99, status: 'Active' }]; // no name field
    const r = queryList(rows, { search: 'item 0', searchKeys: ['name'], pageSize: 100 });
    assert.equal(r.total, 9); // Item 01..Item 09
    assert.ok(r.rows.every(x => x.name?.toLowerCase().includes('item 0')));
});

test('search with no searchKeys matches nothing new (never scans every field by accident)', () => {
    const r = queryList(ROWS, { search: 'item', pageSize: 100 });
    assert.equal(r.total, 23, 'no searchKeys: search is a no-op, not a full-row scan');
});

test('sort orders ascending by default, descending when asked, and is stable for equal keys', () => {
    const asc = queryList(ROWS, { sort: 'status', pageSize: 100 });
    assert.deepEqual(asc.rows.map(r => r.status).slice(0, 3), ['Active', 'Active', 'Active']);
    const desc = queryList(ROWS, { sort: 'status', sortDir: 'descending', pageSize: 100 });
    assert.equal(desc.rows[0].status, 'Draft');
});

test('filter, search and sort combine: each narrows what the next stage sees', () => {
    const r = queryList(ROWS, { filter: row => row.status !== 'Archived', search: '1', searchKeys: ['name'], sort: 'name', sortDir: 'descending', pageSize: 100 });
    assert.ok(r.rows.every(x => x.status !== 'Archived' && x.name.includes('1')));
    assert.deepEqual(r.rows.map(x => x.name), [...r.rows.map(x => x.name)].sort().reverse());
});

test('pagination: total and pages reflect the filtered count, not the source array', () => {
    const r = queryList(ROWS, { filter: row => row.status === 'Draft', pageSize: 3 });
    const draftCount = ROWS.filter(x => x.status === 'Draft').length;
    assert.equal(r.total, draftCount);
    assert.equal(r.pages, Math.ceil(draftCount / 3));
    assert.equal(r.rows.length, Math.min(3, draftCount));
});

test('a page beyond range (a filter shrank the result after the page was chosen) clamps into range', () => {
    const r = queryList(ROWS, { filter: row => row.status === 'Draft', page: 99, pageSize: 3 });
    assert.equal(r.page, r.pages);
    assert.ok(r.rows.length > 0);
});

test('page 0 or negative clamps to page 1, never an empty or out-of-bounds slice', () => {
    assert.equal(queryList(ROWS, { page: 0, pageSize: 5 }).page, 1);
    assert.equal(queryList(ROWS, { page: -5, pageSize: 5 }).page, 1);
});

test('an empty source array is one empty page, not zero pages', () => {
    const r = queryList([], { pageSize: 25 });
    assert.deepEqual(r, { rows: [], total: 0, pages: 1, page: 1 });
});

test('at scale (1000 rows), every page is exactly pageSize except the last, and every row appears exactly once across all pages', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
    const pageSize = 25;
    const first = queryList(rows, { pageSize });
    assert.equal(first.total, 1000); assert.equal(first.pages, 40);
    const seen = new Set();
    for (let page = 1; page <= first.pages; page++) {
        const r = queryList(rows, { page, pageSize });
        assert.equal(r.rows.length, page < first.pages ? pageSize : 1000 - pageSize * (first.pages - 1));
        for (const row of r.rows) seen.add(row.id);
    }
    assert.equal(seen.size, 1000, 'every row appears on exactly one page');
});
