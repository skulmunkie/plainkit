// js/page-context.js (#670): the standalone page context, driven by a fake router, written onto fake elements by bindPageContext.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageContext, bindPageContext } from '../js/page-context.js';
import { addLogSink, setLogLevel } from '../js/log.js';

setLogLevel('warn');
const logs = [];
addLogSink(e => logs.push(e));

const routes = [{ id: 'orders', path: '/', label: 'Orders', children: [{ id: 'order', path: '/:id', label: p => `Order ${p.id}` }] }, { id: 'about', path: '/about', label: 'About', context: { title: 'About us' } }];
const nav = [{ id: 'orders', title: 'Orders', route: '/' }];
const fakeRouter = start => {
    let url = start;
    const fns = new Set();
    return {
        current: () => (url ? { path: url, url, params: url === '/8' ? { id: '8' } : {}, query: {} } : null),
        subscribe: fn => (fns.add(fn), () => fns.delete(fn)),
        go(u) { url = u; for (const f of fns) f(); },
    };
};
const doc = { title: '', createElement: () => el() };
function el(id) {
    const attrs = new Map();
    const e = {
        children: [], rows: [], ownerDocument: doc, attrs, textContent: '',
        getAttribute: n => attrs.get(n) ?? null, setAttribute: (n, v) => attrs.set(n, String(v)), removeAttribute: n => attrs.delete(n),
        hasAttribute: n => attrs.has(n), toggleAttribute(n, on) { if (on) attrs.set(n, ''); else attrs.delete(n); },
        replaceChildren(...k) { e.children = k; }, querySelectorAll: () => e.rows,
    };
    if (id) attrs.set('data-id', id);
    return e;
}

test('get: the URL default, then a route context and a set() override field by field', () => {
    const r = fakeRouter('/8'), ctx = createPageContext({ router: r, routes, nav });
    assert.equal(ctx.get().title, 'Order 8');
    assert.deepEqual(ctx.get().ids, ['orders']);
    ctx.set({ title: 'Order 8 (paid)' });
    assert.equal(ctx.get().title, 'Order 8 (paid)');
    assert.equal(ctx.get().crumbs.at(-1).label, 'Order 8 (paid)', 'a title rewrites the last crumb');
    r.go('/about');
    assert.equal(ctx.get().title, 'About us', 'a navigation drops the manual override and reads the route context');
});

test('subscribe: called on a change only, in order, and stops after unsubscribe or destroy', () => {
    const r = fakeRouter('/'), ctx = createPageContext({ router: r, routes, nav }), seen = [];
    const off = ctx.subscribe(c => seen.push('a:' + c.title));
    ctx.subscribe(c => seen.push('b:' + c.title));
    ctx.set({});
    assert.deepEqual(seen, [], 'nothing changed');
    r.go('/8');
    assert.deepEqual(seen, ['a:Order 8', 'b:Order 8']);
    off();
    r.go('/');
    assert.deepEqual(seen.slice(2), ['b:Orders']);
    ctx.destroy();
    r.go('/8');
    assert.equal(seen.length, 3);
});

test('a route context that throws is logged and the URL default stands; no route gives an empty context', () => {
    logs.length = 0;
    const bad = [{ id: 'x', path: '/', label: 'X', context: () => { throw new Error('boom'); } }];
    assert.equal(createPageContext({ router: fakeRouter('/'), routes: bad }).get().title, 'X');
    assert.ok(logs.length > 0, 'the error is logged');
    assert.deepEqual(createPageContext({ router: fakeRouter(null), routes }).get(), { ids: [], section: null, current: null, crumbs: [], title: '' });
});

test('bindPageContext writes the nav rows, header, breadcrumb and document title, and unbinds', () => {
    const r = fakeRouter('/'), ctx = createPageContext({ router: r, routes, nav });
    const navEl = el(), row = el('orders'), other = el('x');
    navEl.rows = [row, other];
    const header = el(), crumbs = el();
    const off = bindPageContext(ctx, { nav: navEl, header, breadcrumb: crumbs, title: t => `${t} - App` });
    assert.ok(row.hasAttribute('current') && !other.hasAttribute('current'));
    assert.equal(header.getAttribute('heading'), 'Orders');
    assert.deepEqual(JSON.parse(header.getAttribute('crumbs')), ctx.get().crumbs);
    assert.equal(crumbs.children.length, 1);
    assert.equal(doc.title, 'Orders - App');
    r.go('/8');
    assert.equal(header.getAttribute('heading'), 'Order 8');
    assert.equal(crumbs.children.length, 2);
    assert.equal(doc.title, 'Order 8 - App');
    off();
    r.go('/');
    assert.equal(header.getAttribute('heading'), 'Order 8', 'unbound: no more writes');
});
