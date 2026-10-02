// Unit tests for pk-data-table: the query/load/state machine (stale-response guard, loading, error with Retry, empty), the filters built from
// config, and selection that survives paging and search (scope page or all; for all the host gets the current query). Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './data-table.js';

globalThis.MutationObserver ??= class { observe() {} disconnect() {} };

const fakeEl = tag => ({
    localName: tag, attrs: {}, dataset: {}, children: [], listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...k) { this.children.push(...k); },
    replaceChildren(...k) { this.children = k; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    fire(type, e) { for (const fn of [...(this.listeners[type] ?? [])]) fn(e); },
    ownerDocument: { createElement: fakeEl },
    requestUpdate() { this.updates = (this.updates ?? 0) + 1; },
    remove() { this.gone = true; },
    toggleAttribute(k, on) { this.attrs[k] = on; },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});

const make = () => {
    const parts = Object.fromEntries(['table', 'filters', 'pagination', 'state'].map(n => [n, fakeEl(n)]));
    const events = [];
    const el = new (behaviour(class {
        children = [];
        part(n) { return parts[n]; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return { querySelectorAll: () => [], matches: () => false }; }
        emit(name, detail) { events.push({ name, detail }); }
    }))();
    el.config = {};
    return { el, parts, events };
};
const rowsOf = n => ({ rows: Array.from({ length: n }, (_, i) => ({ id: i + 1 })), total: n });
const inner = detail => ({ detail, stopPropagation() {} });

test('the host\'s cell-<id>-<key> slots are re-slotted into the inner pk-table (only those), and rebuilt when they change (#817)', () => {
    const { el, parts } = make();
    el.children = [{ slot: 'cell-1-name' }, { slot: 'actions' }, { slot: 'cell-2-name' }];
    el.forwardSlots();
    const slots = () => parts.table.children.filter(c => c.localName === 'slot');
    assert.deepEqual(slots().map(s => [s.name, s.slot]), [['cell-1-name', 'cell-1-name'], ['cell-2-name', 'cell-2-name']]);
    const first = slots(), updates = parts.table.updates;
    el.forwardSlots();
    assert.equal(parts.table.updates, updates, 'unchanged: nothing rebuilt');
    el.children = [{ slot: 'cell-3-name' }];
    el.forwardSlots();
    assert.ok(first.every(s => s.gone), 'stale forwards are removed');
    assert.deepEqual(slots().filter(s => !s.gone).map(s => s.name), ['cell-3-name']);
    assert.equal(parts.table.updates, updates + 1, 'the table is asked to redraw so it finds them');
});

test('filters map field types to controls, add an Any option to a select, and rebuild only when config.filters changes', () => {
    const { el, parts } = make();
    el.config = { filters: [{ key: 'q', type: 'text', label: 'Query' }, { key: 'n', type: 'number', label: 'Count' }, { key: 'status', type: 'select', label: 'Status', options: ['Active', { value: 'archived', label: 'Archived' }] }] };
    el.buildFilters();
    const [q, n, status] = parts.filters.children;
    assert.equal(q.localName, 'pk-input'); assert.equal(q.type, 'text'); assert.equal(q.showLabel, true); assert.equal(q.dataset.key, 'q');
    assert.equal(n.type, 'number');
    assert.equal(status.localName, 'pk-select');
    assert.deepEqual(status.children.map(c => c.value), ['', 'Active', 'archived']);
    const before = parts.filters.children;
    el.buildFilters();
    assert.equal(parts.filters.children, before);
});

test('refresh shows the empty state without a load callback and never shows the table', async () => {
    const { el, parts } = make();
    el.config = { empty: { heading: 'No orders yet' } };
    await el.refresh();
    assert.equal(parts.table.hidden, true);
    assert.equal(parts.state.children[0].localName, 'pk-empty-state');
    assert.equal(parts.state.children[0].attrs.heading, 'No orders yet');
});

test('refresh runs load(query), shows the table on rows and feeds the pager; the table is hidden and a loading state shown while in flight', async () => {
    const { el, parts } = make();
    el.config = { columns: [{ key: 'sku', label: 'SKU' }] };
    const seen = [];
    let release;
    el.load = q => { seen.push(q); return new Promise(r => { release = r; }); };
    const p = el.refresh();
    assert.equal(parts.table.hidden, true);
    assert.equal(parts.state.children[0].localName, 'pk-skeleton');
    release({ rows: [{ id: 1, sku: 'AC-001' }], total: 42 });
    await p;
    assert.deepEqual(seen, [{ page: 1, pageSize: 25, sort: null, sortDir: 'ascending', search: '', filters: {} }]);
    assert.equal(parts.table.hidden, false);
    assert.deepEqual(parts.table.rows, [{ id: 1, sku: 'AC-001' }]);
    assert.deepEqual(parts.table.columns, [{ key: 'sku', label: 'SKU' }]);
    assert.deepEqual([parts.pagination.total, parts.pagination.page, parts.pagination.pageSize], [42, 1, 25]);
    assert.equal(parts.state.children.length, 0);
});

test('zero rows show the configured empty state', async () => {
    const { el, parts } = make();
    el.config = { empty: { heading: 'Nothing found', description: 'Try another filter.' } };
    el.load = async () => ({ rows: [], total: 0 });
    await el.refresh();
    assert.equal(parts.table.hidden, true);
    assert.equal(parts.state.children[0].attrs.heading, 'Nothing found');
    assert.equal(parts.state.children[0].attrs.description, 'Try another filter.');
});

test('a rejecting load() shows the error state with Retry, which runs it again', async () => {
    const { el, parts } = make();
    let calls = 0;
    el.load = async () => { calls++; if (calls === 1) throw new Error('boom'); return rowsOf(1); };
    await el.refresh();
    const alert = parts.state.children[0];
    assert.equal(alert.localName, 'pk-alert');
    assert.equal(alert.textContent, 'boom');
    await alert.children[0].listeners.click[0]();
    assert.equal(calls, 2);
    assert.equal(parts.table.hidden, false);
});

test('a stale response (an older load finishing after a newer one) never draws, and a stale rejection never shows an error', async () => {
    const { el, parts } = make();
    const pending = [];
    el.load = () => new Promise((ok, no) => pending.push({ ok, no }));
    const first = el.refresh(), second = el.refresh();
    pending[1].ok({ rows: [{ id: 'new' }], total: 1 });
    await second;
    pending[0].ok({ rows: [{ id: 'old' }], total: 1 });
    await first;
    assert.deepEqual(parts.table.rows, [{ id: 'new' }]);
    const third = el.refresh(), fourth = el.refresh();
    pending[3].ok(rowsOf(1));
    await fourth;
    pending[2].no(new Error('late'));
    await third;
    assert.equal(parts.state.children.length, 0, 'the late failure draws nothing');
    assert.equal(parts.table.hidden, false);
});

test('sort, search, filter, page and page-size events narrow the query, reset the page, and re-run load', async () => {
    const { el, parts } = make();
    el.config = { filters: [{ key: 'status', type: 'text', label: 'Status' }] };
    const queries = [];
    el.load = async q => { queries.push(q); return rowsOf(1); };
    el.connected();
    await el.refresh();
    parts.table.fire('pk-sort', { detail: { key: 'name', direction: 'descending' } });
    assert.deepEqual(queries.at(-1), { page: 1, pageSize: 25, sort: 'name', sortDir: 'descending', search: '', filters: {} });
    parts.filters.fire('pk-search', { detail: { query: 'widget' } });
    assert.equal(queries.at(-1).search, 'widget');
    const status = parts.filters.children[0];
    status.value = 'Active';
    parts.filters.fire('pk-value-change', { target: status, detail: { value: 'Active' } });
    assert.deepEqual(queries.at(-1).filters, { status: 'Active' });
    assert.equal(parts.filters.filterCount, 1);
    parts.pagination.fire('pk-page', { detail: { page: 3 } });
    assert.equal(queries.at(-1).page, 3);
    parts.pagination.fire('pk-page-size', { detail: { pageSize: 50 } });
    assert.deepEqual([queries.at(-1).pageSize, queries.at(-1).page], [50, 1]);
    parts.filters.fire('pk-clear-filters');
    assert.deepEqual(queries.at(-1).filters, {});
    assert.equal(status.value, '');
    assert.equal(parts.filters.filterCount, 0);
    assert.equal(el.query.search, 'widget', 'the query is readable');
});

test('rowHref makes the table clickable and is called on pk-row-click; without it the table is not clickable', async () => {
    const { el, parts } = make();
    el.load = async () => rowsOf(1);
    el.connected();
    await el.refresh();
    assert.equal(parts.table.clickable, false);
    const seen = [];
    el.rowHref = row => seen.push(row);
    await el.refresh();
    assert.equal(parts.table.clickable, true);
    parts.table.fire('pk-row-click', { detail: { id: '1', row: { id: 1 } } });
    assert.deepEqual(seen, [{ id: 1 }]);
});

test('clickable (no rowHref) makes rows clickable and currentRow reaches the table (#817)', async () => {
    const { el, parts } = make();
    el.load = async () => rowsOf(2);
    el.clickable = true; el.currentRow = '2';
    await el.refresh();
    assert.deepEqual([parts.table.clickable, parts.table.currentRow], [true, '2']);
    el.clickable = false; el.currentRow = '';
    await el.refresh();
    assert.deepEqual([parts.table.clickable, parts.table.currentRow], [false, '']);
});

test('config feeds the pager, search, table labels and the initial sort and page size; a config that arrives late still counts until the reader changes the query (#817)', async () => {
    const { el, parts } = make();
    const queries = [];
    el.load = async q => { queries.push(q); return rowsOf(1); };
    el.connected();
    await el.refresh();
    assert.deepEqual([parts.filters.label, parts.filters.debounce, parts.pagination.sizes, parts.pagination.label, parts.table.label, parts.table.caption], ['Search', 250, [], 'Pagination', '', '']);
    assert.equal(parts.filters.attrs['data-nosearch'], false);
    el.config = { searchLabel: 'Find orders', searchDebounce: 400, searchable: false, pageSizeOptions: [10, 50], pagerLabel: 'Order pages', label: 'Orders', caption: 'All orders', sort: 'name', sortDir: 'descending', pageSize: 10 };
    el.changed('config');
    await el.refresh();
    assert.deepEqual([parts.filters.label, parts.filters.debounce, parts.pagination.sizes, parts.pagination.label, parts.table.label, parts.table.caption], ['Find orders', 400, [10, 50], 'Order pages', 'Orders', 'All orders']);
    assert.equal(parts.filters.attrs['data-nosearch'], true);
    assert.deepEqual([queries.at(-1).sort, queries.at(-1).sortDir, queries.at(-1).pageSize], ['name', 'descending', 10]);
    assert.deepEqual([parts.table.sort, parts.table.sortDir], ['name', 'descending'], 'the header shows the initial sort');
    parts.pagination.fire('pk-page', { detail: { page: 2 } });
    el.config = { ...el.config, sort: 'other' };
    el.changed('config');
    assert.equal(queries.at(-1).sort, 'name', 'once the reader has moved, the config no longer resets the query');
});

test('load gets an AbortSignal that a newer request (or leaving the page) aborts; the aborted rejection draws nothing (#817)', async () => {
    const { el, parts, events } = make();
    const calls = [];
    el.load = (q, opts) => new Promise((ok, no) => { calls.push(opts.signal); opts.signal.addEventListener('abort', () => no(new DOMException('aborted', 'AbortError'))); calls.ok = ok; });
    const first = el.refresh(), second = el.refresh();
    assert.equal(calls[0].aborted, true, 'the first request was aborted by the second');
    assert.equal(calls[1].aborted, false);
    await first;
    assert.equal(parts.state.children[0].localName, 'pk-skeleton', 'the abort shows no error');
    assert.equal(events.length, 0, 'and raises no pk-load-error');
    calls.ok({ rows: [{ id: 1 }], total: 1 });
    await second;
    assert.equal(parts.table.hidden, false);
    el.refresh();
    el.disconnected();
    assert.equal(calls[2].aborted, true, 'leaving the page aborts the one in flight');
});

test('presentation props pass straight to the table (#817)', async () => {
    const { el, parts } = make();
    el.load = async () => rowsOf(1);
    Object.assign(el, { cards: true, striped: true, density: 'compact', maxHeight: '10rem', stickyHeader: true });
    await el.refresh();
    assert.deepEqual(['cards', 'striped', 'density', 'maxHeight', 'stickyHeader'].map(k => parts.table[k]), [true, true, 'compact', '10rem', true]);
});

test('selectable: the table gets selectable, rowKey and the total; not selectable: no total (the scope helper is never loaded)', async () => {
    const { el, parts } = make();
    el.load = async () => ({ rows: [{ id: 1 }], total: 40 });
    await el.refresh();
    assert.equal(parts.table.total, 0);
    el.selectable = true; el.rowKey = 'sku';
    await el.refresh();
    assert.deepEqual([parts.table.selectable, parts.table.rowKey, parts.table.total], [true, 'sku', 40]);
});

test('selection survives paging and search: the ids stay on the table and are exposed with the scope and the query', async () => {
    const { el, parts, events } = make();
    el.selectable = true; el.selected = []; el.selectScope = 'page';
    el.load = async () => rowsOf(3);
    el.connected();
    await el.refresh();
    let stopped = false;
    parts.table.fire('pk-select', { detail: { selected: ['1', '2'] }, stopPropagation() { stopped = true; } });
    assert.equal(stopped, true, "the inner event does not leak out beside the element's own");
    assert.deepEqual(el.selected, ['1', '2']);
    assert.deepEqual(events.at(-1), { name: 'pk-select', detail: { selected: ['1', '2'], scope: 'page', query: el.query } });
    parts.pagination.fire('pk-page', { detail: { page: 2 } });
    parts.filters.fire('pk-search', { detail: { query: 'x' } });
    await el.refresh();
    assert.deepEqual(parts.table.selected, ['1', '2'], 'paging and searching do not clear it');
    assert.equal(el.selectScope, 'page');
});

test('scope all: pk-select-all widens it, the event carries the query for a server-side bulk action, and a new search or filter narrows it back to page', async () => {
    const { el, parts, events } = make();
    el.selectable = true; el.selected = []; el.selectScope = 'page';
    el.load = async () => ({ rows: [{ id: 1 }, { id: 2 }], total: 90 });
    el.connected();
    await el.refresh();
    parts.table.fire('pk-select', inner({ selected: ['1', '2'] }));
    parts.filters.fire('pk-search', { detail: { query: 'ac' } });
    parts.table.fire('pk-select-all', inner({ scope: 'all', count: 90 }));
    assert.equal(el.selectScope, 'all');
    const e = events.at(-1);
    assert.equal(e.name, 'pk-select');
    assert.deepEqual([e.detail.scope, e.detail.selected, e.detail.query.search, e.detail.query.page], ['all', ['1', '2'], 'ac', 1]);
    parts.pagination.fire('pk-page', { detail: { page: 2 } });
    assert.equal(el.selectScope, 'all', 'paging keeps it: it is every row of the query');
    parts.table.fire('pk-sort', { detail: { key: 'a', direction: 'ascending' } });
    assert.equal(el.selectScope, 'all', 'so does sorting');
    parts.filters.fire('pk-search', { detail: { query: 'zz' } });
    assert.equal(el.selectScope, 'page', 'another search is another set of rows');
    assert.equal(events.at(-1).detail.scope, 'page');
    assert.deepEqual(el.selected, ['1', '2']);
    const n = events.length;
    parts.table.fire('pk-select-all', inner({ scope: 'page', count: 2 }));
    assert.equal(events.length, n, 'a page-scope select-all adds nothing: pk-select already carried the ids');
});
