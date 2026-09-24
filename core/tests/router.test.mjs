// The route tree, its breadcrumb derivation, the mounted router and createPage's `router` option (modules/router/router.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute, buildCrumbs, fillPath, mountRouter } from '../modules/router/router.js';
import { createPage } from '../js/page.js';

const routes = [{ path: '/', label: 'Home', children: [
    { path: '/orders', label: 'Orders', children: [
        { path: '/orders/new', label: 'New order' },
        { path: '/orders/:id', label: p => `Order ${p.id}` },
    ] },
    { path: '/admin', label: 'Admin', crumb: false, children: [{ path: '/admin/users', label: 'Users' }] },
] }];

function fakeWin(path = '/') {
    const listeners = {};
    const win = {
        location: { pathname: path, origin: 'http://x', href: 'http://x' + path },
        history: { pushState: (s, t, p) => { win.location.pathname = p; win.location.href = 'http://x' + p; } },
        addEventListener: (t, f) => { listeners[t] = f; },
        removeEventListener: (t, f) => { if (listeners[t] === f) delete listeners[t]; },
        listeners,
    };
    globalThis.window = win;
    return win;
}

test('matchRoute captures params, prefers a static segment over a :param, and returns null for an unknown path', () => {
    assert.deepEqual(matchRoute(routes, '/orders/7').params, { id: '7' });
    assert.equal(matchRoute(routes, '/orders/new').node.label, 'New order');
    assert.equal(matchRoute(routes, '/orders/a%20b').params.id, 'a b');
    assert.equal(matchRoute(routes, '/orders/7/x'), null);
    assert.equal(matchRoute(routes, '/orders/?q=1#h').node.label, 'Orders');
});

test('buildCrumbs is the ancestor chain with hrefs from the params, the last item without href, and crumb:false left out', () => {
    assert.deepEqual(buildCrumbs(matchRoute(routes, '/orders/7')), [
        { label: 'Home', href: '/' }, { label: 'Orders', href: '/orders' }, { label: 'Order 7' }]);
    assert.deepEqual(buildCrumbs(matchRoute(routes, '/admin/users')), [{ label: 'Home', href: '/' }, { label: 'Users' }]);
    assert.deepEqual(buildCrumbs(null), []);
    assert.equal(fillPath('/orders/:id', { id: 'a b' }), '/orders/a%20b');
});

test('mountRouter reads the location, navigates with pushState, notifies subscribers and stops after destroy', () => {
    const win = fakeWin('/orders/3');
    const router = mountRouter(null, { routes });
    assert.equal(router.current().label, 'Order 3');
    const seen = [];
    router.subscribe(r => seen.push(r.current()?.label));
    router.navigate('/orders');
    assert.deepEqual(seen, ['Orders']);
    router.navigate('/nowhere');
    assert.equal(router.current(), null);
    assert.deepEqual(router.crumbs(), []);
    win.location.pathname = '/';
    win.listeners.popstate();
    assert.equal(seen.at(-1), 'Home');
    router.destroy();
    assert.equal(win.listeners.popstate, undefined);
    assert.equal(router.href('/orders/:id', { id: 9 }), '/orders/9');
});

test('intercept turns a same-origin link click into navigate and ignores modified and cross-origin clicks', () => {
    fakeWin('/');
    let click;
    const container = { addEventListener: (t, f) => { click = f; }, removeEventListener() {} };
    const router = mountRouter(container, { routes, intercept: true });
    const ev = (href, extra = {}) => ({ target: { closest: () => ({ href, hasAttribute: () => false }) }, button: 0, preventDefault() { this.prevented = true; }, ...extra });
    const a = ev('http://x/orders'); click(a);
    assert.equal(a.prevented, true);
    assert.equal(router.current().label, 'Orders');
    const b = ev('http://other/orders/1'); click(b);
    const c = ev('http://x/admin/users', { ctrlKey: true }); click(c);
    assert.ok(!b.prevented && !c.prevented);
    assert.equal(router.current().label, 'Orders');
});

test('createPage with a router sets breadcrumbs and the title now and on each route change, and destroy stops following', () => {
    fakeWin('/orders/3');
    class El { constructor() { this.children = []; } append(...k) { this.children.push(...k); } replaceChildren(...k) { this.children = k; } }
    globalThis.document = { title: '', createElement: () => ({}) };
    const breadcrumb = new El();
    const router = mountRouter(null, { routes });
    const page = createPage({ breadcrumb, router });
    assert.deepEqual(breadcrumb.children.map(a => a.textContent), ['Home', 'Orders', 'Order 3']);
    assert.equal(document.title, 'Order 3');
    router.navigate('/orders');
    assert.equal(document.title, 'Orders');
    page.destroy();
    router.navigate('/');
    assert.equal(document.title, 'Orders');
    delete globalThis.document;
});
