// The dashboard page type composing from modules (#494, step 3): `surface` composes tabs and widgets from contributed metadata, each widget loads through the host's internal
// service (a fake here) on demand, one failing widget does not touch another, a new run or leaving the page aborts the previous one, and a denied contribution is never offered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from '../js/app/pages/dashboard-modules.js';
import dashboardPage from '../js/app/pages/dashboard.js';
import { setLogLevel } from '../js/log.js';

setLogLevel('silent');
const c = (key, extra = {}) => ({ key, for: ['overview'], label: key.toUpperCase(), kind: 'stat', ...extra });
const ENTRIES = [
    { id: 'sales', contributes: [c('churn', { tab: 'sales', order: 20 }), c('mrr', { tab: 'sales', order: 10 }), c('hidden', { can: () => false }), c('throws', { can: () => { throw new Error('x'); } })] },
    { id: 'ops', contributes: [c('queue', { tab: 'ops', kind: 'chart' }), c('missing', { tab: 'ops' })] },
];
function fakeCtx({ defs = {}, entries = ENTRIES } = {}) {
    const ac = new AbortController();
    const calls = [];
    const ctx = {
        signal: ac.signal, auth: { who: 'me' }, settings: null, href: () => '#', route: { path: '/' },
        _widgets: { entries: async () => entries, def: async id => { calls.push(id); if (!defs[id]) throw new Error(`import of ${id} failed`); return defs[id]; } },
    };
    return { ctx, ac, calls };
}

test('setup composes tabs and widgets from contributed metadata, in order, dropping denied contributions, and imports nothing', async () => {
    const { ctx, calls } = fakeCtx();
    const { config } = await setup({ surface: 'overview', heading: 'Overview', tabs: [{ id: 'sales', label: 'Sales' }, { id: 'ops', label: 'Operations' }] }, ctx);
    assert.deepEqual(config.widgets.map(w => w.key), ['sales:mrr', 'sales:churn', 'ops:queue', 'ops:missing']);
    assert.deepEqual(config.widgets.map(w => [w.kind, w.tab]), [['stat', 'sales'], ['stat', 'sales'], ['chart', 'ops'], ['stat', 'ops']]);
    assert.deepEqual(config.tabs, [{ id: 'sales', label: 'Sales' }, { id: 'ops', label: 'Operations' }]);
    assert.equal(config.heading, 'Overview');
    assert.deepEqual(calls, [], 'composing loads no module code');
});

test('a route without tabs and one implicit tab draws no tab strip', async () => {
    const { ctx } = fakeCtx({ entries: [{ id: 'sales', contributes: [c('mrr')] }] });
    const { config } = await setup({ surface: 'overview' }, ctx);
    assert.equal(config.tabs, undefined);
    assert.equal(config.widgets.length, 1);
});

test('load calls the widget of its module with the context and its own signal; one failing widget does not affect another', async () => {
    const seen = [];
    const defs = {
        sales: { widgets: { mrr: { load: async a => { seen.push(a); return { value: '9' }; } }, churn: { load: async () => { throw new Error('backend down'); } } } },
        ops: { widgets: {} },
    };
    const { ctx, calls } = fakeCtx({ defs });
    const { load } = await setup({ surface: 'overview' }, ctx);
    assert.deepEqual(await load('sales:mrr', { range: '7d' }), { value: '9' });
    assert.deepEqual(seen[0].context, { range: '7d' });
    assert.equal(seen[0].ctx.id, 'sales');
    assert.equal(seen[0].ctx.auth, ctx.auth);
    assert.equal(seen[0].ctx.mount, undefined, 'a widget gets a subset of the ctx, not the module ctx');
    await assert.rejects(load('sales:churn', {}), /Something went wrong/);
    await assert.rejects(load('ops:missing', {}), /Something went wrong/, 'drift between contributes and widgets fails only that key, with the generic text (the detail is logged)');
    await assert.rejects(load('nope:x', {}), /unknown widget/);
    assert.deepEqual(calls, ['sales', 'sales', 'ops'], 'only the modules asked for were imported');
});

test('a failing import rejects only that widget, and a retry asks again', async () => {
    const defs = {};
    const { ctx, calls } = fakeCtx({ defs });
    const { load } = await setup({ surface: 'overview' }, ctx);
    await assert.rejects(load('sales:mrr', {}), /Something went wrong/);
    defs.sales = { widgets: { mrr: { load: async () => ({ value: '1' }) } } };
    assert.deepEqual(await load('sales:mrr', {}), { value: '1' });
    assert.equal(calls.length, 2);
});

test('a new run of a widget aborts its previous one, and leaving the page aborts every run', async () => {
    const signals = [];
    const defs = { sales: { widgets: { mrr: { load: ({ signal }) => { signals.push(signal); return new Promise(() => {}); } } } } };
    const { ctx, ac } = fakeCtx({ defs });
    const { load } = await setup({ surface: 'overview' }, ctx);
    load('sales:mrr', {}); await new Promise(r => setImmediate(r));
    load('sales:mrr', {}); await new Promise(r => setImmediate(r));
    assert.equal(signals.length, 2);
    assert.equal(signals[0].aborted, true, 'the first run was replaced');
    assert.equal(signals[1].aborted, false);
    ac.abort();
    assert.equal(signals[1].aborted, true, 'the page ctx signal aborts the widget');
    load('sales:mrr', {}); await new Promise(r => setImmediate(r));
    assert.equal(signals[2].aborted, true, 'a run started after the page ended is aborted at once');
});

test('without the module host service a surface fails with a clear message', async () => {
    await assert.rejects(setup({ surface: 'overview' }, { signal: new AbortController().signal }), /needs the app module host/);
});

test('the page type: a surface builds pk-dashboard-page from the composed config and wires load with the element context; no surface keeps the route config as it was', async () => {
    const made = [];
    const doc = { createElement: tag => { const el = { tag, context: { range: '30d' }, addEventListener() {}, removeEventListener() {}, remove() {}, setAttribute() {}, append() {} }; made.push(el); return el; } };
    const host = { ownerDocument: doc, append() {} };
    const seen = [];
    const defs = { sales: { widgets: { mrr: { load: async a => (seen.push(a.context), { value: '5' }) } } } };
    const { ctx } = fakeCtx({ defs, entries: [{ id: 'sales', contributes: [c('mrr', { tab: 'sales' })] }] });
    const cleanup = await dashboardPage(host, { surface: 'overview', heading: 'Overview', tabs: [{ id: 'sales', label: 'Sales' }] }, ctx);
    const el = made.find(e => e.tag === 'pk-dashboard-page');
    assert.deepEqual(el.config.widgets.map(w => w.key), ['sales:mrr']);
    assert.deepEqual(await el.load('sales:mrr'), { value: '5' });
    assert.deepEqual(seen, [{ range: '30d' }], 'the widget sees the page filters');
    cleanup?.();
    made.length = 0;
    await dashboardPage(host, { heading: 'Plain', widgets: [{ key: 'a', label: 'A' }], load: (key, c2) => [key, c2 === ctx] }, ctx);
    assert.deepEqual(await made[0].load('a'), ['a', true]);
});
