// Unit tests for pk-dashboard-page: building sections/tiles from config, and that each tile's load(key) is its own isolated async
// boundary - loading, ready or error per tile, and a slow/rejecting tile never blocks or corrupts another. Stub base, no DOM.
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
    const body = fakeEl('div');
    const fakeRoot = { querySelectorAll: () => [], matches: () => false };
    const el = new (behaviour(class {
        part(n) { return n === 'body' ? body : undefined; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return fakeRoot; }
    }))();
    el.config = {};
    return { el, body };
};

// A box (a tile's part="tile" div) after renderState/an assign: box.children[0] is the skeleton/alert/pk-stat/pk-chart.
const boxFor = (body, key) => body.children.flatMap(s => s.children.find(c => c.attrs.part === 'grid')?.children ?? []).find(b => b.dataset.key === key);

test('buildLayout with no sections puts every tile in one ungrouped grid, in order', () => {
    const { el, body } = make();
    el.config = { tiles: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] };
    el.connected();
    assert.equal(body.children.length, 1, 'one section');
    const [section] = body.children;
    assert.equal(section.children.some(c => c.localName === 'h3'), false, 'no heading without one');
    const grid = section.children.find(c => c.attrs.part === 'grid');
    assert.deepEqual(grid.children.map(b => b.dataset.key), ['a', 'b']);
});

test('buildLayout groups tiles into sections with their own heading, in the order given, and skips a key with no matching tile', () => {
    const { el, body } = make();
    el.config = {
        tiles: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }],
        sections: [{ heading: 'Sales', tiles: ['b', 'missing'] }, { heading: 'Ops', tiles: ['a', 'c'] }],
    };
    el.connected();
    assert.equal(body.children.length, 2);
    const [sales, ops] = body.children;
    assert.equal(sales.children.find(c => c.localName === 'h3').textContent, 'Sales');
    assert.deepEqual(sales.children.find(c => c.attrs.part === 'grid').children.map(b => b.dataset.key), ['b']);
    assert.equal(ops.children.find(c => c.localName === 'h3').textContent, 'Ops');
    assert.deepEqual(ops.children.find(c => c.attrs.part === 'grid').children.map(b => b.dataset.key), ['a', 'c']);
});

test('a tile with kind stat (the default) resolves load(key) onto a pk-stat labelled from the tile', async () => {
    const { el, body } = make();
    el.config = { tiles: [{ key: 'orders', label: 'Open orders' }] };
    el.load = async key => ({ value: String(key === 'orders' ? 12 : 0), tone: 'positive' });
    el.connected();
    await Promise.resolve(); await Promise.resolve();
    const box = boxFor(body, 'orders');
    const stat = box.children[0];
    assert.equal(stat.localName, 'pk-stat');
    assert.equal(stat.label, 'Open orders');
    assert.equal(stat.value, '12');
    assert.equal(stat.tone, 'positive');
});

test('a tile with kind chart resolves load(key) onto a pk-chart captioned from the tile', async () => {
    const { el, body } = make();
    el.config = { tiles: [{ key: 'trend', label: 'Sales trend', kind: 'chart' }] };
    el.load = async () => ({ data: { labels: ['Jan', 'Feb'], series: [{ name: 'Sales', values: [1, 2] }] } });
    el.connected();
    await Promise.resolve(); await Promise.resolve();
    const chart = boxFor(body, 'trend').children[0];
    assert.equal(chart.localName, 'pk-chart');
    assert.equal(chart.caption, 'Sales trend');
    assert.deepEqual(chart.data, { labels: ['Jan', 'Feb'], series: [{ name: 'Sales', values: [1, 2] }] });
});

test('per-tile async boundary: a fast tile renders while a slower sibling is still loading, and a rejecting tile shows its own error without touching the others', async () => {
    const { el, body } = make();
    el.config = { tiles: [{ key: 'fast', label: 'Fast' }, { key: 'slow', label: 'Slow' }, { key: 'bad', label: 'Bad' }] };
    let releaseSlow;
    const slowGate = new Promise(r => { releaseSlow = r; });
    el.load = async key => {
        if (key === 'fast') return { value: '1' };
        if (key === 'slow') { await slowGate; return { value: '2' }; }
        throw new Error('tile boom');
    };
    el.connected();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    // While slow is still pending: fast is already ready, bad has already failed on its own, slow is still a skeleton.
    assert.equal(boxFor(body, 'fast').children[0].localName, 'pk-stat', 'fast tile did not wait for slow');
    assert.equal(boxFor(body, 'fast').children[0].value, '1');
    assert.equal(boxFor(body, 'slow').children[0].localName, 'pk-skeleton', 'slow tile is still loading');
    const badAlert = boxFor(body, 'bad').children[0];
    assert.equal(badAlert.localName, 'pk-alert', 'a rejecting tile shows an error, not a stuck skeleton');
    assert.equal(badAlert.textContent, 'tile boom');

    releaseSlow();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(boxFor(body, 'slow').children[0].localName, 'pk-stat', 'slow tile resolves once released');
    assert.equal(boxFor(body, 'slow').children[0].value, '2');
    // The fast and bad tiles were never touched by slow's resolution.
    assert.equal(boxFor(body, 'fast').children[0].value, '1');
    assert.equal(boxFor(body, 'bad').children[0].localName, 'pk-alert');
});

test('the error state Retry button reloads only that tile', async () => {
    const { el, body } = make();
    el.config = { tiles: [{ key: 'a', label: 'A' }] };
    let calls = 0;
    el.load = async () => { calls++; if (calls === 1) throw new Error('boom'); return { value: 'ok' }; };
    el.connected();
    await Promise.resolve(); await Promise.resolve();
    const alert = boxFor(body, 'a').children[0];
    assert.equal(alert.localName, 'pk-alert');
    const retryBtn = alert.children[0];
    await retryBtn.listeners.click[0]();
    assert.equal(calls, 2);
    assert.equal(boxFor(body, 'a').children[0].localName, 'pk-stat');
    assert.equal(boxFor(body, 'a').children[0].value, 'ok');
});

test('without a load callback every tile shows its own empty state', async () => {
    const { el, body } = make();
    el.config = { tiles: [{ key: 'a', label: 'A', empty: { heading: 'No data yet' } }] };
    el.connected();
    await Promise.resolve(); await Promise.resolve();
    const box = boxFor(body, 'a');
    assert.equal(box.children[0].localName, 'pk-empty-state');
    assert.equal(box.children[0].attrs.heading, 'No data yet');
});

test('changing config rebuilds the layout and reloads every tile', async () => {
    const { el, body } = make();
    el.config = { tiles: [{ key: 'a', label: 'A' }] };
    el.load = async () => ({ value: '1' });
    el.connected();
    await Promise.resolve(); await Promise.resolve();
    el.config = { tiles: [{ key: 'b', label: 'B' }] };
    el.changed('config');
    await Promise.resolve(); await Promise.resolve();
    assert.equal(boxFor(body, 'a'), undefined, 'the old tile is gone');
    assert.equal(boxFor(body, 'b').children[0].localName, 'pk-stat');
});
