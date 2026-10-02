// Unit tests for pk-dashboard-page: widgets as pk-card, tabs that load lazily, filters that reload only what already loaded, and that each
// widget's load(key) is its own isolated async boundary. Stub base, no DOM: a card's data-state says which state the page drew into it.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './dashboard-page.js';

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
    const parts = { body: fakeEl('div'), filters: fakeEl('div'), header: fakeEl('div') };
    const fakeRoot = { querySelectorAll: () => [], matches: () => false };
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return fakeRoot; }
    }))();
    el.config = {};
    return { el, body: parts.body, filters: parts.filters };
};

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const walk = (node, out = []) => { out.push(node); for (const c of node.children ?? []) walk(c, out); return out; };
const cards = body => walk(body).filter(n => n.localName === 'pk-card');
const cardFor = (body, key) => cards(body).find(c => c.dataset.key === key);
const stateOf = card => card.dataset.state;
const alertOf = card => walk(card).find(n => n.localName === 'pk-alert');
const gridKeys = grid => grid.children.map(c => c.dataset.key);

test('no sections and no tabs puts every widget in one ungrouped grid of pk-cards headed by the label, in order', () => {
    const { el, body } = make();
    el.config = { widgets: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] };
    el.connected();
    assert.equal(body.children.length, 1, 'one section');
    const [section] = body.children;
    assert.equal(section.children.some(c => c.localName === 'h3'), false);
    const grid = section.children.find(c => c.attrs.part === 'grid');
    assert.deepEqual(gridKeys(grid), ['a', 'b']);
    assert.equal(grid.children[0].localName, 'pk-card');
    assert.equal(grid.children[0].heading, 'A');
    assert.equal(walk(body).some(n => n.localName === 'pk-tabs'), false, 'no tab strip');
});

test('sections group widgets with their own heading, in order, and skip a key with no widget', () => {
    const { el, body } = make();
    el.config = {
        widgets: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }],
        sections: [{ heading: 'Sales', widgets: ['b', 'missing'] }, { heading: 'Ops', widgets: ['a', 'c'] }],
    };
    el.connected();
    const [sales, ops] = body.children;
    assert.equal(sales.children.find(c => c.localName === 'h3').textContent, 'Sales');
    assert.deepEqual(gridKeys(sales.children.find(c => c.attrs.part === 'grid')), ['b']);
    assert.deepEqual(gridKeys(ops.children.find(c => c.attrs.part === 'grid')), ['a', 'c']);
});

test('a stat widget (the default) resolves load(key) onto a pk-stat in its card, state ready', async () => {
    const { el, body } = make();
    el.config = { widgets: [{ key: 'orders', label: 'Open orders' }] };
    el.load = async key => ({ value: String(key === 'orders' ? 12 : 0), tone: 'positive' });
    el.connected();
    assert.equal(stateOf(cardFor(body, 'orders')), 'loading');
    await flush();
    const card = cardFor(body, 'orders');
    assert.equal(stateOf(card), 'ready');
    const stat = card.children[0];
    assert.equal(stat.localName, 'pk-stat');
    assert.equal(stat.label, 'Open orders');
    assert.equal(stat.value, '12');
    assert.equal(stat.tone, 'positive');
});

test('a chart widget resolves load(key) onto a pk-chart captioned from the widget', async () => {
    const { el, body } = make();
    el.config = { widgets: [{ key: 'trend', label: 'Sales trend', kind: 'chart' }] };
    el.load = async () => ({ data: { labels: ['Jan'], series: [{ name: 'Sales', values: [1] }] } });
    el.connected();
    await flush();
    const chart = cardFor(body, 'trend').children[0];
    assert.equal(chart.localName, 'pk-chart');
    assert.equal(chart.caption, 'Sales trend');
});

test('per-widget async boundary: a fast card is ready while a slow sibling loads, and a rejecting card shows its own error without touching the others', async () => {
    const { el, body } = make();
    el.config = { widgets: [{ key: 'fast', label: 'Fast' }, { key: 'slow', label: 'Slow' }, { key: 'bad', label: 'Bad' }] };
    let releaseSlow;
    const slowGate = new Promise(r => { releaseSlow = r; });
    el.load = async key => {
        if (key === 'fast') return { value: '1' };
        if (key === 'slow') { await slowGate; return { value: '2' }; }
        throw new Error('widget boom');
    };
    el.connected();
    await flush();
    assert.equal(stateOf(cardFor(body, 'fast')), 'ready');
    assert.equal(cardFor(body, 'fast').children[0].value, '1');
    assert.equal(stateOf(cardFor(body, 'slow')), 'loading');
    assert.equal(stateOf(cardFor(body, 'bad')), 'error');
    assert.equal(alertOf(cardFor(body, 'bad')).textContent, 'widget boom');
    releaseSlow();
    await flush();
    assert.equal(stateOf(cardFor(body, 'slow')), 'ready');
    assert.equal(cardFor(body, 'slow').children[0].value, '2');
    assert.equal(cardFor(body, 'fast').children[0].value, '1');
    assert.equal(stateOf(cardFor(body, 'bad')), 'error');
});

test('the error state Retry reloads only that widget', async () => {
    const { el, body } = make();
    el.config = { widgets: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] };
    const calls = { a: 0, b: 0 };
    el.load = async key => { calls[key]++; if (key === 'a' && calls.a === 1) throw new Error('boom'); return { value: 'ok' }; };
    el.connected();
    await flush();
    const card = cardFor(body, 'a');
    assert.equal(stateOf(card), 'error');
    walk(alertOf(card)).find(n => n.localName === 'pk-button').fire('click');
    await flush();
    assert.deepEqual(calls, { a: 2, b: 1 });
    assert.equal(stateOf(card), 'ready');
    assert.equal(card.children[0].value, 'ok');
});

test('without a load callback every card is empty with its own text', () => {
    const { el, body } = make();
    el.config = { widgets: [{ key: 'a', label: 'A', empty: { heading: 'No data yet' } }] };
    el.connected();
    const card = cardFor(body, 'a');
    assert.equal(stateOf(card), 'empty');
    assert.equal(walk(card).find(n => n.localName === 'pk-empty-state').attrs.heading, 'No data yet');
});

test('no widgets configured shows the body-level empty state', () => {
    const { el, body } = make();
    el.config = { empty: { heading: 'Add a widget to get started' } };
    el.connected();
    assert.equal(body.children[0].localName, 'pk-empty-state');
    assert.equal(body.children[0].attrs.heading, 'Add a widget to get started');
});

test('changing config rebuilds the layout and reloads every widget', async () => {
    const { el, body } = make();
    el.config = { widgets: [{ key: 'a', label: 'A' }] };
    el.load = async () => ({ value: '1' });
    el.connected();
    await flush();
    el.config = { widgets: [{ key: 'b', label: 'B' }] };
    el.changed('config');
    await flush();
    assert.equal(cardFor(body, 'a'), undefined);
    assert.equal(stateOf(cardFor(body, 'b')), 'ready');
});

const TABBED = {
    tabs: [{ id: 'overview', label: 'Overview' }, { id: 'sales', label: 'Sales' }],
    widgets: [{ key: 'revenue', tab: 'overview', label: 'Revenue' }, { key: 'trend', tab: 'overview', label: 'Trend', kind: 'chart' }, { key: 'churn', tab: 'sales', label: 'Churn' }],
};

test('tabs: a pk-tabs with one pk-tab and pk-tab-panel per tab, each holding only its own widgets', () => {
    const { el, body } = make();
    el.config = TABBED;
    el.load = async () => ({ value: '1' });
    el.connected();
    const strip = body.children[0];
    assert.equal(strip.localName, 'pk-tabs');
    assert.equal(strip.value, 'overview');
    const panels = strip.children.filter(c => c.localName === 'pk-tab-panel');
    assert.deepEqual(panels.map(p => p.value), ['overview', 'sales']);
    assert.deepEqual(panels.map(p => cards(p).map(c => c.dataset.key)), [['revenue', 'trend'], ['churn']]);
    assert.deepEqual(strip.children.filter(c => c.localName === 'pk-tab').map(t => t.textContent), ['Overview', 'Sales']);
});

test('tabs: an unopened tab never calls load(); opening it loads its widgets once; revisiting reloads nothing', async () => {
    const { el, body } = make();
    el.config = TABBED;
    const seen = [];
    el.load = async key => { seen.push(key); return { value: '1' }; };
    el.connected();
    await flush();
    assert.deepEqual(seen, ['revenue', 'trend'], 'only the initial tab loaded');
    const strip = body.children[0];
    strip.fire('pk-tab-change', { detail: { value: 'sales' } });
    await flush();
    assert.deepEqual(seen, ['revenue', 'trend', 'churn']);
    strip.fire('pk-tab-change', { detail: { value: 'overview' } });
    strip.fire('pk-tab-change', { detail: { value: 'sales' } });
    await flush();
    assert.deepEqual(seen, ['revenue', 'trend', 'churn'], 'a revisit is pure visibility');
});

test('tabs: a widget naming no known tab belongs to the first tab; sections are scoped to their tab', () => {
    const { el, body } = make();
    el.config = {
        tabs: TABBED.tabs,
        widgets: [{ key: 'x', label: 'X' }, { key: 'y', tab: 'nope', label: 'Y' }, { key: 'z', tab: 'sales', label: 'Z' }],
        sections: [{ heading: 'Key', tab: 'sales', widgets: ['z'] }],
    };
    el.connected();
    const panels = body.children[0].children.filter(c => c.localName === 'pk-tab-panel');
    assert.deepEqual(cards(panels[0]).map(c => c.dataset.key), ['x', 'y']);
    assert.equal(walk(panels[1]).find(c => c.localName === 'h3').textContent, 'Key');
    assert.deepEqual(cards(panels[1]).map(c => c.dataset.key), ['z']);
});

test('filters: the bar builds a control per filter; a change lands on this.context and reloads only widgets that already loaded', async () => {
    const { el, body, filters } = make();
    el.config = { ...TABBED, filters: [{ key: 'range', type: 'select', label: 'Range', options: ['7d', '30d'] }] };
    const seen = [];
    el.load = async key => { seen.push([key, el.context.range]); return { value: '1' }; };
    el.connected();
    await flush();
    assert.equal(filters.children.length, 1);
    assert.equal(filters.children[0].localName, 'pk-field', 'a select is wrapped so its label shows');
    assert.equal(filters.children[0].label, 'Range');
    assert.equal(filters.children[0].children[0].localName, 'pk-select');
    assert.deepEqual(el.context, {});
    seen.length = 0;
    el.onFilterChange({ target: { dataset: { key: 'range' } }, detail: { value: '30d' } });
    await flush();
    assert.deepEqual(el.context, { range: '30d' });
    assert.deepEqual(seen, [['revenue', '30d'], ['trend', '30d']], 'the unopened Sales tab never loaded');
    body.children[0].fire('pk-tab-change', { detail: { value: 'sales' } });
    await flush();
    assert.deepEqual(seen.at(-1), ['churn', '30d'], 'a tab opened later loads with the current selections');
    seen.length = 0;
    el.onFilterChange({ target: { dataset: { key: 'range' } }, detail: { value: '' } });
    await flush();
    assert.deepEqual(el.context, {}, 'an empty selection is dropped');
    assert.equal(seen.length, 3, 'now all three widgets have loaded, so all three reload');
});

test('filters: a config change that keeps the same filters keeps the selections', async () => {
    const { el } = make();
    const filters = [{ key: 'q', type: 'text', label: 'Q' }];
    el.config = { widgets: [{ key: 'a', label: 'A' }], filters };
    el.connected();
    el.onFilterChange({ target: { dataset: { key: 'q' } }, detail: { value: 'x' } });
    el.config = { widgets: [{ key: 'a', label: 'A2' }], filters };
    el.changed('config');
    assert.deepEqual(el.context, { q: 'x' });
});
