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

// ---- sort cycle (js/table-data.js), one pk-select per checkbox click, keyboard activation of clickable rows

const { nextSort } = await import('../../js/table-data.js');

test('the same header cycles ascending, descending, cleared; another header starts ascending', () => {
    assert.deepEqual(nextSort('', 'ascending', 'a'), ['a', 'ascending']);
    assert.deepEqual(nextSort('a', 'ascending', 'a'), ['a', 'descending']);
    assert.deepEqual(nextSort('a', 'descending', 'a'), [null, null]);
    assert.deepEqual(nextSort('a', 'descending', 'b'), ['b', 'ascending']);
    assert.deepEqual(sortRows(rows, undefined, 'ascending').map(r => r.id), [1, 2, 3], 'a cleared sort is the natural order');
});

// The element's own methods, run against a stand-in host: no DOM needed.
const Table = (await import('./table.js')).default(class {});
const host = extra => { const events = []; return Object.assign(Object.create(Table.prototype), { events, selected: [], rowKey: 'id', manual: true, rows, columns: [], sort: 'a', sortDir: 'descending', emit(name, detail) { events.push([name, detail]); return true; } }, extra); };
const box = (data, checked) => ({ target: { dataset: data, checked } });

test('a checkbox click raises change and input, and pk-select is raised once', () => {
    const t = host();
    for (const type of ['input', 'change']) t.input({ type, ...box({ select: '2' }, true) });
    assert.deepEqual(t.events, [['pk-select', { selected: ['2'] }]]);
    const all = host();
    for (const type of ['input', 'change']) all.input({ type, ...box({ selectAll: '' }, true) });
    assert.equal(all.events.length, 1);
    assert.deepEqual(all.events[0][1].selected, ['1', '2', '3']);
});

test('sorting cleared through the header reports a null key and direction, also when the host owns the rows (manual)', () => {
    const t = host();
    t.sortBy(null, null);
    assert.deepEqual(t.events, [['pk-sort', { key: null, direction: null }]]);
    assert.equal(t.sort, '');
    assert.equal(t.sortDir, 'ascending');
    const c = host({ emit() { return false; } });
    c.sortBy(null, null);
    assert.equal(c.sort, 'a', 'a cancelled event keeps the sort');
});

test('Enter and Space on the row itself activate a clickable row; keys on controls inside it do not', () => {
    const row = { matches: s => s === 'tbody tr[data-clickable]' }, cell = { matches: () => false };
    for (const key of ['Enter', ' ']) assert.equal(X.activates({ key, target: row }, { clickable: true }), true);
    assert.equal(X.activates({ key: 'Enter', target: cell }, { clickable: true }), false);
    assert.equal(X.activates({ key: 'a', target: row }, { clickable: true }), false);
    assert.equal(X.activates({ key: 'Enter', target: row }, { clickable: false }), false);
});

test('currentRow marks one row with aria-current and a tint and is a host-set string', async () => {
    const { readFileSync } = await import('node:fs');
    const meta = JSON.parse(readFileSync(new URL('./table.meta.json', import.meta.url), 'utf8'));
    const p = meta.props.find(x => x.name === 'currentRow');
    assert.deepEqual([p.type, p.default, p.reflect], ['string', '', true]);
    assert.match(readFileSync(new URL('./table.js', import.meta.url), 'utf8'), /'aria-current': this\.currentRow && this\.currentRow === id \? 'true' : null/);
    assert.match(readFileSync(new URL('./table.css', import.meta.url), 'utf8'), /tr\[aria-current\]/);
});
