// The dashboard composed from modules (#494): defineModule validation, the merge (tab ownership, two modules in one tab), duplicate keys, a throwing function,
// the size warning, the one load(key) dispatcher, and the dashboard page-type chunk (composed when the route has no config, untouched when it has one).
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineModule } from '../js/app/module.js';
import { composeDashboard, dashboardOf, allModules, MAX_WIDGETS } from '../js/app/dashboard.js';
import pageFactory from '../js/app/pages/dashboard.js';
import { setLogLevel, addLogSink } from '../js/log.js';

setLogLevel('silent');
const logs = [];
addLogSink(e => logs.push(e));
const mod = (id, extra) => defineModule({ id, ...extra });
const w = (key, tab, load) => ({ key, tab, label: key.toUpperCase(), kind: 'stat', load });

test('defineModule validates dashboardTabs and dashboard, naming the module', () => {
    assert.throws(() => mod('a', { dashboardTabs: [{ id: 'x' }] }), /defineModule\("a"\).*dashboardTabs/);
    assert.throws(() => mod('a', { dashboardTabs: 'x' }), /dashboardTabs/);
    assert.throws(() => mod('b', { dashboard: [{ key: 'k', label: 'K' }] }), /defineModule\("b"\).*dashboard/);
    assert.throws(() => mod('b', { dashboard: 5 }), /dashboard must be/);
    assert.throws(() => mod('b', { dashboard: [{ key: 'k', label: 'K', kind: 'stat', load: 1 }] }), /load must be a function/);
    assert.doesNotThrow(() => mod('c', { dashboardTabs: [{ id: 't', label: 'T' }], dashboard: () => [] }));
    assert.doesNotThrow(() => mod('c', { dashboard: [w('k', 't', async () => ({}))] }));
});

test('two modules contribute to one tab; the first owns its label; load is stripped from the JSON', () => {
    const a = mod('a', { dashboardTabs: [{ id: 'main', label: 'Main' }], dashboard: [w('one', 'main', async () => 1)] });
    const b = mod('b', { dashboardTabs: [{ id: 'main', label: 'Other label' }, { id: 'more', label: 'More' }], dashboard: ctx => [w('two', 'main', async () => 2), w('three', 'more', async () => ctx.n)] });
    const { config } = composeDashboard([a, b], { n: 3 });
    assert.deepEqual(config.tabs, [{ id: 'main', label: 'Main' }, { id: 'more', label: 'More' }]);
    assert.deepEqual(config.widgets.map(x => x.key), ['one', 'two', 'three']);
    assert.ok(config.widgets.every(x => !('load' in x)));
    assert.doesNotThrow(() => JSON.stringify(config));
});

test('the dispatcher calls the owning loader with the page element as this; an unknown key rejects', async () => {
    const seen = [];
    const a = mod('a', { dashboard: [w('one', undefined, async function (key) { seen.push([this, key]); return { value: 1 }; })] });
    const { config, load } = composeDashboard([a], {});
    assert.equal(config.tabs, undefined, 'no tabs when nobody declares or uses one');
    const page = {};
    assert.deepEqual(await load.call(page, 'one'), { value: 1 });
    assert.deepEqual(seen, [[page, 'one']]);
    await assert.rejects(() => load.call(page, 'ghost'), /no module provides the widget "ghost"/);
});

test('a duplicate widget key across modules is an error naming both', () => {
    const a = mod('a', { dashboard: [w('k')] }), b = mod('b', { dashboard: [w('k')] });
    assert.throws(() => composeDashboard([a, b], {}), /"k".*"a".*"b"/);
});

test('a throwing dashboard function is logged once, never fatal; a bad entry is skipped', () => {
    logs.length = 0;
    const bad = mod('bad', { dashboard: () => { throw new Error('boom'); } });
    const ok = mod('ok', { dashboard: [w('fine')] });
    for (let i = 0; i < 3; i++) assert.deepEqual(composeDashboard([bad, ok], {}).config.widgets.map(x => x.key), ['fine']);
    assert.equal(logs.filter(l => l.level === 'error' && /"bad" threw/.test(l.message)).length, 1);
    logs.length = 0;
    const skipped = dashboardOf({ id: 'odd', dashboard: () => [{ key: 1 }, w('good')] }, {});
    assert.deepEqual(skipped.widgets.map(x => x.key), ['good']);
    assert.equal(logs.filter(l => /"odd"/.test(l.message)).length, 1);
    assert.deepEqual(dashboardOf({ id: 'n', dashboard: () => 'nope' }, {}).widgets, []);
});

test('a tab nobody declares is added with a warning, and an oversized dashboard is warned once', () => {
    logs.length = 0;
    const { config } = composeDashboard([mod('u', { dashboard: [w('x', 'ghost-tab')] })], {});
    assert.deepEqual(config.tabs, [{ id: 'ghost-tab', label: 'ghost-tab' }]);
    assert.ok(logs.some(l => l.level === 'warn' && /ghost-tab/.test(l.message)));
    logs.length = 0;
    const many = mod('many', { dashboard: Array.from({ length: MAX_WIDGETS + 1 }, (_, i) => w(`k${i}`)) });
    composeDashboard([many], {}); composeDashboard([many], {});
    assert.equal(logs.filter(l => /a dashboard is a few key figures/.test(l.message)).length, 1);
});

// The page-type chunk against a stub element: what the pk-dashboard-page gets.
const stub = () => {
    const el = { remove() { el.removed = true; } };
    const host = { ownerDocument: { createElement: tag => Object.assign(el, { tag }) }, append: () => {} };
    return { el, host };
};

test('the dashboard chunk composes when the route has no config, and leaves an explicit config alone', async () => {
    const a = mod('a', { dashboardTabs: [{ id: 't', label: 'T' }], dashboard: [w('one', 't', async () => ({ value: 1 }))] });
    const ctx = { modules: async () => [a] };
    const composed = stub();
    const cleanup = await pageFactory(composed.host, undefined, ctx);
    assert.equal(composed.el.tag, 'pk-dashboard-page');
    assert.deepEqual(composed.el.config.widgets.map(x => x.key), ['one']);
    assert.deepEqual(await composed.el.load('one'), { value: 1 });
    cleanup();
    assert.ok(composed.el.removed);

    const own = stub();
    const calls = [];
    await pageFactory(own.host, { widgets: [{ key: 'mine', label: 'Mine', kind: 'stat' }], load: (key, c) => calls.push([key, c]) }, ctx);
    assert.deepEqual(own.el.config.widgets, [{ key: 'mine', label: 'Mine', kind: 'stat' }]);
    own.el.load('mine');
    assert.deepEqual(calls, [['mine', ctx]]);

    const empty = stub();
    await pageFactory(empty.host, { widgets: [] }, ctx);
    assert.deepEqual(empty.el.config.widgets, [], 'an explicit empty widgets list is not composed over');
    assert.equal(empty.el.load, undefined);
});

test('allModules loads what is not loaded, skips denied and failed modules, keeps allow-list order', async () => {
    const a = mod('a'), c = mod('c');
    const allow = new Map([['a', { id: 'a', load: async () => a }], ['b', { id: 'b', load: async () => { throw new Error('nope'); } }], ['c', { id: 'c', load: async () => ({ default: c }) }], ['d', { id: 'd', load: async () => mod('d') }]]);
    const defs = new Map();
    const out = await allModules({ allow, defs, access: entry => entry.id !== 'd', define: defineModule, log: { warn() {} } });
    assert.deepEqual(out.map(x => x.id), ['a', 'c']);
    assert.ok(!defs.has('d') && !defs.has('b'));
});

test('without ctx.modules (mountPage) a bare dashboard route stays as it was', async () => {
    const s = stub();
    await pageFactory(s.host, undefined, {});
    assert.equal(s.el.config.widgets, undefined);
});
