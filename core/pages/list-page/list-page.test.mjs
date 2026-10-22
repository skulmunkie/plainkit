// Unit tests for pk-list-page: the page frame around its pk-data-table (toolbar actions from config, the load and rowHref callbacks handed down, the config handed down).
// The query, load, states and selection live in pk-data-table and are tested in core/components/data-table/. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './list-page.js';

globalThis.MutationObserver ??= class { observe() {} disconnect() {} };

const fakeEl = tag => ({
    localName: tag, attrs: {}, dataset: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...k) { this.children.push(...k); },
    replaceChildren(...k) { this.children = k; },
    addEventListener(n, fn) { if (n === 'click') this.click = fn; },
    ownerDocument: { createElement: fakeEl },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});

const make = () => {
    const parts = { header: fakeEl('div'), table: fakeEl('pk-data-table'), actions: fakeEl('div'), bulk: fakeEl('div') };
    const fakeRoot = { querySelectorAll: () => [], matches: () => false };
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return fakeRoot; }
    }))();
    el.config = {}; el.children = [];
    return { el, parts };
};

test('connected hands the table keys of the config to the data table as props and builds the toolbar actions, once', () => {
    const { el, parts } = make();
    el.config = { columns: [{ key: 'a', label: 'A' }], actions: [{ label: 'New', href: '#/orders/new' }] };
    el.connected();
    el.connected();
    assert.deepEqual(parts.table.columns, [{ key: 'a', label: 'A' }], 'the page config keys the table has a plain prop for are handed down as those props');
    assert.equal(parts.actions.children.length, 1);
    assert.equal(parts.actions.children[0].localName, 'pk-button');
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

test('load is handed down as it is now (an empty page without one) and rowHref only when given', async () => {
    const { el, parts } = make();
    el.connected();
    assert.deepEqual(await parts.table.load({ page: 1 }), { rows: [] });
    assert.equal(parts.table.rowHref, null);
    const seen = [];
    el.load = async q => { seen.push(q); return { rows: [{ id: 1 }], total: 1 }; };
    el.rowHref = row => seen.push(row);
    el.changed('config');
    assert.deepEqual(await parts.table.load({ page: 2 }), { rows: [{ id: 1 }], total: 1 });
    parts.table.rowHref({ id: 1 });
    assert.deepEqual(seen, [{ page: 2 }, { id: 1 }]);
});

test('clickable is handed down to the table', () => {
    const { el, parts } = make();
    el.connected();
    assert.equal(parts.table.clickable, false);
    el.clickable = true;
    el.changed('clickable');
    assert.equal(parts.table.clickable, true);
});

test('selectable and rowKey are handed to the data table, and a bulk action raises pk-bulk with the table\'s selection', () => {
    const { el, parts } = make();
    const raised = [];
    el.emit = (name, detail) => raised.push([name, detail]);
    el.config = { selectable: true, rowKey: 'sku', bulkActions: [{ id: 'archive', label: 'Archive', variant: 'danger' }] };
    el.connected();
    assert.equal(parts.table.selectable, true); assert.equal(parts.table.rowKey, 'sku');
    assert.equal(parts.bulk.children.length, 1);
    Object.assign(parts.table, { selected: ['a', 'b'], selectScope: 'all', query: { page: 2 } });
    parts.bulk.children[0].click();
    assert.deepEqual(raised, [['pk-bulk', { action: 'archive', selected: ['a', 'b'], scope: 'all', query: { page: 2 } }]]);
});

test('without selectable there is no selection and no bulk bar', () => {
    const { el, parts } = make();
    el.config = { bulkActions: [{ id: 'x', label: 'X' }] };
    el.connected();
    assert.equal(parts.table.selectable, false);
    assert.equal(parts.bulk.children.length, 0);
});

test('the host cell-<id>-<key> children are forwarded as slots to the data table (#1000)', () => {
    const { el, parts } = make();
    el.connected();
    el.children = [{ slot: 'cell-1-name' }, { slot: 'cell-2-name' }, { slot: 'other' }];
    el.forwardSlots();
    assert.deepEqual(parts.table.children.map(c => c.name), ['cell-1-name', 'cell-2-name']);
    for (const c of parts.table.children) c.remove = () => parts.table.children.splice(parts.table.children.indexOf(c), 1);
    el.children = [{ slot: 'cell-2-name' }];
    el.forwardSlots();
    assert.deepEqual(parts.table.children.map(c => c.name), ['cell-2-name']);
});

test('refresh() loads the data table again, so a load set after the first (empty) draw shows its rows (#1401)', () => {
    const { el, parts } = make();
    let n = 0; parts.table.refresh = () => { n++; return 'again'; };
    el.connected();
    el.load = async () => ({ rows: [{ id: 1 }], total: 1 });
    assert.equal(el.refresh(), 'again');
    assert.equal(n, 1);
});

test('host content in the actions slot keeps the title bar shown when the config draws none, and the toolbar slot is the data table toolbar\'s own', () => {
    const { el, parts } = make();
    el.connected();
    el.buildActions();
    assert.equal(parts.header.attrs['data-bare'], 'true');
    el.children = [{ slot: 'actions' }];
    el.showHeaderSlot();
    assert.equal(parts.header.attrs['data-bare'], 'false');
    assert.equal(parts.actions.children.length, 0, 'config.actions are not mixed with the slot content');
});

test('a config with no host slot content leaves a bare title bar bare', () => {
    const { el, parts } = make();
    el.children = [{ slot: 'toolbar' }];
    el.connected();
    assert.equal(parts.header.attrs['data-bare'], 'true');
});

test('the shadow template forwards the actions slot to the title bar and the toolbar slot to the data table actions slot', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('./list-page.html', import.meta.url), 'utf8');
    assert.match(html, /<slot name="actions" slot="actions"><\/slot><div part="before" hidden><slot name="before-list"><\/slot><\/div><pk-data-table/);
    assert.match(html, /<slot name="toolbar" slot="actions"><\/slot>/);
});

test('rows are cards on a phone unless config.cards is false or the list is selectable (a card has no select-all)', () => {
    const { el, parts } = make();
    el.connected();
    assert.equal(parts.table.cards, true);
    el.config = { cards: false };
    el.changed('config');
    assert.equal(parts.table.cards, false);
    el.config = { cards: true };
    el.changed('config');
    assert.equal(parts.table.cards, true);
    el.config = { selectable: true };
    el.changed('config');
    assert.equal(parts.table.cards, false);
    el.config = { selectable: true, cards: true };
    el.changed('config');
    assert.equal(parts.table.cards, true);
});

test('the initial query of the config (search, filterValues, sort, sortDir, page) is handed to the data table', () => {
    const { el, parts } = make();
    el.config = { search: 'acme', filterValues: { channel: 'ebay' }, sort: 'total', sortDir: 'descending', page: 3 };
    el.connected();
    assert.deepEqual([parts.table.search, parts.table.filterValues, parts.table.sort, parts.table.sortDir, parts.table.page], ['acme', { channel: 'ebay' }, 'total', 'descending', 3]);
});

import { readFileSync } from 'node:fs';
test('the template has a before-list slot ahead of the table (#1603)', () => {
    const html = readFileSync(new URL('./list-page.html', import.meta.url), 'utf8');
    assert.ok(html.indexOf('<slot name="before-list">') > 0 && html.indexOf('<slot name="before-list">') < html.indexOf('<pk-data-table'));
});
