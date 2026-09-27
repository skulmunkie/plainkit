// Unit tests for pk-list-page: building filters and actions from config, tracking the query (sort/filter/search/page) from the composed
// pk-table/pk-table-filters/pk-pagination events, running load(query), and the empty/error/retry path.
// Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './list-page.js';

const fakeEl = tag => ({
    localName: tag, attrs: {}, dataset: {}, children: [], listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...k) { this.children.push(...k); },
    replaceChildren(...k) { this.children = k; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    fire(type, e) { for (const fn of [...(this.listeners[type] ?? [])]) fn(e); },
    ownerDocument: { createElement: fakeEl },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});

const make = () => {
    const table = fakeEl('pk-table');
    const filters = fakeEl('pk-table-filters');
    const actions = fakeEl('div');
    const pagination = fakeEl('pk-pagination');
    const state = fakeEl('div');
    for (const p of [table, filters, actions, pagination, state]) p.ownerDocument = { createElement: fakeEl };
    const parts = { table, filters, actions, pagination, state };
    const fakeRoot = { querySelectorAll: () => [], matches: () => false };
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return fakeRoot; }
    }))();
    el.config = {};
    return { el, parts };
};

test('connected wires events once (idempotent) and builds the initial filters and actions', () => {
    const { el, parts } = make();
    el.config = { filters: [{ key: 'q', type: 'text', label: 'Search' }], actions: [{ label: 'New', href: '#/orders/new' }] };
    el.connected();
    el.connected();
    assert.equal(parts.filters.children.length, 1);
    assert.equal(parts.filters.children[0].localName, 'pk-input');
    assert.equal(parts.actions.children.length, 1);
    assert.equal(parts.actions.children[0].localName, 'pk-button');
});

test('buildFilters maps field types to controls, adds an Any option to a select, and only rebuilds when config.filters actually changes', () => {
    const { el, parts } = make();
    el.config = { filters: [
        { key: 'q', type: 'text', label: 'Query' },
        { key: 'n', type: 'number', label: 'Count' },
        { key: 'status', type: 'select', label: 'Status', options: ['Active', { value: 'archived', label: 'Archived' }] },
    ] };
    el.buildFilters();
    const [q, n, status] = parts.filters.children;
    assert.equal(q.localName, 'pk-input'); assert.equal(q.type, 'text'); assert.equal(q.label, 'Query'); assert.equal(q.showLabel, true); assert.equal(q.dataset.key, 'q');
    assert.equal(n.localName, 'pk-input'); assert.equal(n.type, 'number');
    assert.equal(status.localName, 'pk-select');
    assert.equal(status.children.length, 3, 'the Any option plus the two given');
    assert.equal(status.children[0].value, ''); assert.equal(status.children[1].value, 'Active'); assert.equal(status.children[2].value, 'archived'); assert.equal(status.children[2].textContent, 'Archived');

    const before = parts.filters.children;
    el.buildFilters(); // same config.filters: no rebuild
    assert.equal(parts.filters.children, before);
});

test('buildActions renders a pk-button per action with its label, href and variant, and only rebuilds when config.actions changes', () => {
    const { el, parts } = make();
    el.config = { actions: [{ label: 'New order', href: '#/orders/new', variant: 'primary' }] };
    el.buildActions();
    const [btn] = parts.actions.children;
    assert.equal(btn.localName, 'pk-button'); assert.equal(btn.textContent, 'New order'); assert.equal(btn.href, '#/orders/new'); assert.equal(btn.variant, 'primary');
    const before = parts.actions.children;
    el.buildActions();
    assert.equal(parts.actions.children, before);
});

test('refresh shows the empty state without a load callback, and never touches the table', async () => {
    const { el, parts } = make();
    el.config = { empty: { heading: 'No orders yet' } };
    await el.refresh();
    assert.equal(parts.table.hidden, true);
    assert.equal(parts.state.children[0].localName, 'pk-empty-state');
    assert.equal(parts.state.children[0].attrs.heading, 'No orders yet');
});

test('refresh runs load(query) with the current query, shows the table on rows, and feeds the pager', async () => {
    const { el, parts } = make();
    el.config = { columns: [{ key: 'sku', label: 'SKU' }] };
    const seen = [];
    el.load = async query => { seen.push(query); return { rows: [{ id: 1, sku: 'AC-001' }], total: 42 }; };
    await el.refresh();
    assert.deepEqual(seen, [{ page: 1, pageSize: 25, sort: null, sortDir: 'ascending', search: '', filters: {} }]);
    assert.equal(parts.table.hidden, false);
    assert.deepEqual(parts.table.rows, [{ id: 1, sku: 'AC-001' }]);
    assert.deepEqual(parts.table.columns, [{ key: 'sku', label: 'SKU' }]);
    assert.equal(parts.pagination.total, 42);
    assert.equal(parts.pagination.page, 1);
    assert.equal(parts.pagination.pageSize, 25);
});

test('refresh shows the configured empty state when load() resolves zero rows', async () => {
    const { el, parts } = make();
    el.config = { empty: { heading: 'Nothing found', description: 'Try another filter.' } };
    el.load = async () => ({ rows: [], total: 0 });
    await el.refresh();
    assert.equal(parts.table.hidden, true);
    assert.equal(parts.state.children[0].localName, 'pk-empty-state');
    assert.equal(parts.state.children[0].attrs.heading, 'Nothing found');
    assert.equal(parts.state.children[0].attrs.description, 'Try another filter.');
});

test('a rejecting load() shows the error state with Retry, which runs it again', async () => {
    const { el, parts } = make();
    let calls = 0;
    el.load = async () => { calls++; if (calls === 1) throw new Error('boom'); return { rows: [{ id: 1 }], total: 1 }; };
    await el.refresh();
    const alert = parts.state.children[0];
    assert.equal(alert.localName, 'pk-alert');
    assert.equal(alert.textContent, 'boom');
    const retryBtn = alert.children[0];
    await retryBtn.listeners.click[0]();
    assert.equal(calls, 2);
    assert.equal(parts.table.hidden, false);
});

test('sort, search, filter, page and page-size events narrow the query, reset the page, and re-run load', async () => {
    const { el, parts } = make();
    el.config = { filters: [{ key: 'status', type: 'text', label: 'Status' }] };
    const queries = [];
    el.load = async query => { queries.push(query); return { rows: [{ id: 1 }], total: 1 }; };
    el.connected();
    await el.refresh(); // initial

    parts.table.fire('pk-sort', { detail: { key: 'name', direction: 'descending' } });
    await Promise.resolve();
    assert.deepEqual(queries.at(-1), { page: 1, pageSize: 25, sort: 'name', sortDir: 'descending', search: '', filters: {} });

    parts.filters.fire('pk-search', { detail: { query: 'widget' } });
    await Promise.resolve();
    assert.equal(queries.at(-1).search, 'widget');

    const statusControl = parts.filters.children[0];
    statusControl.value = 'Active';
    parts.filters.fire('pk-value-change', { target: statusControl, detail: { value: 'Active' } });
    await Promise.resolve();
    assert.deepEqual(queries.at(-1).filters, { status: 'Active' });
    assert.equal(parts.filters.filterCount, 1);

    parts.pagination.fire('pk-page', { detail: { page: 3 } });
    await Promise.resolve();
    assert.equal(queries.at(-1).page, 3);

    parts.pagination.fire('pk-page-size', { detail: { pageSize: 50 } });
    await Promise.resolve();
    assert.equal(queries.at(-1).pageSize, 50);
    assert.equal(queries.at(-1).page, 1, 'changing the page size resets the page');

    parts.filters.fire('pk-clear-filters');
    await Promise.resolve();
    assert.deepEqual(queries.at(-1).filters, {});
    assert.equal(statusControl.value, '', 'clearing filters resets the built controls too');
    assert.equal(parts.filters.filterCount, 0);
});

test('rowHref makes the table clickable and is called (not the router itself) on pk-row-click', async () => {
    const { el, parts } = make();
    el.load = async () => ({ rows: [{ id: 1 }], total: 1 });
    const seen = [];
    el.rowHref = row => seen.push(row);
    el.connected();
    await el.refresh();
    assert.equal(parts.table.clickable, true);
    parts.table.fire('pk-row-click', { detail: { id: '1', row: { id: 1 } } });
    assert.deepEqual(seen, [{ id: 1 }]);
});

test('without rowHref the table is not clickable', async () => {
    const { el, parts } = make();
    el.load = async () => ({ rows: [{ id: 1 }], total: 1 });
    await el.refresh();
    assert.equal(parts.table.clickable, false);
});
