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

// ---- expandable rows (js/table-expand.js, loaded by the table only when `expandable` is set) and the empty / loading text

globalThis.HTMLElement ??= class {};
const X = await import('../../js/table-expand.js');

// A tiny stand-in for the table's element builder: nodes are plain objects.
const h = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids, children: kids.filter(k => k && k.tag), insertBefore(n, ref) { const i = ref ? this.children.indexOf(ref) : this.children.length; this.children.splice(i, 0, n); } });
const table = (extra = {}) => ({ children: [{ slot: 'detail-2' }, { slot: 'cell-1-a' }], expanded: [], selectable: false, ...extra });

test('toggled adds or removes one id, as strings, and never twice', () => {
    assert.deepEqual(X.toggled([], '2', true), ['2']);
    assert.deepEqual(X.toggled([1, '2'], '2', false), ['1']);
    assert.deepEqual(X.toggled(['2'], '2', true), ['2']);
});

test('only a row the host gave detail content can expand', () => {
    assert.equal(X.hasDetail(table(), '2'), true);
    assert.equal(X.hasDetail(table(), '1'), false);
});

test('an expandable row gets a toggle with aria-expanded and aria-controls pointing at its detail row, which shows the row\'s slot', () => {
    const t = table({ expanded: [2] });
    const [tr, detail] = X.rows(t, h('tr'), '2', 0, 3, h);
    const btn = tr.children[0].kids[0];
    assert.equal(btn.attrs['aria-expanded'], 'true');
    assert.equal(btn.attrs['aria-controls'], detail.attrs.id);
    assert.equal(detail.attrs.hidden, false);
    assert.equal(detail.kids[0].kids[0].attrs.name, 'detail-2');
    assert.equal(detail.kids[0].attrs.colspan, 3);
    const [, closed] = X.rows(table(), h('tr'), '2', 1, 3, h);
    assert.equal(closed.attrs.hidden, true);
});

test('a row without detail content has an empty toggle cell and no detail row, and the toggle goes after the checkbox cell', () => {
    const rowsOf = X.rows(table(), h('tr'), '1', 0, 3, h);
    assert.equal(rowsOf.length, 1);
    assert.equal(rowsOf[0].children[0].kids[0], '');
    const check = h('td'), tr = h('tr', {}, check);
    X.rows(table({ selectable: true }), tr, '1', 0, 3, h);
    assert.equal(tr.children[0], check);
    assert.equal(tr.children[1].attrs['data-expand'], true);
});

test('activating a toggle changes expanded and raises pk-row-expand with { id, index, expanded }', () => {
    const events = [];
    const t = table({ expanded: [], ids: () => ['1', '2'], emit: (n, d) => events.push([n, d]) });
    const btn = { dataset: { expandId: '2' }, getAttribute: () => 'false' };
    assert.equal(X.click(t, { target: { closest: () => btn } }), true);
    assert.deepEqual(t.expanded, ['2']);
    assert.deepEqual(events, [['pk-row-expand', { id: '2', index: 1, expanded: true }]]);
    const open = { dataset: { expandId: '2' }, getAttribute: () => 'true' };
    X.click(t, { target: { closest: () => open } });
    assert.deepEqual(t.expanded, []);
    assert.equal(events[1][1].expanded, false);
    assert.equal(X.click(t, { target: { closest: () => null } }), false);
});

test('the empty state has a text prop, and the table detail slots are listed in the meta', async () => {
    const { readFileSync } = await import('node:fs');
    const meta = JSON.parse(readFileSync(new URL('./table.meta.json', import.meta.url), 'utf8'));
    assert.equal(meta.props.find(p => p.name === 'emptyText').default, 'No rows');
    assert.deepEqual(meta.slots.filter(s => s.dynamic).map(s => s.name), ['cell-<rowId>-<key>', 'detail-<rowId>']);
    assert.ok(meta.events.some(e => e.name === 'pk-row-expand'));
});
