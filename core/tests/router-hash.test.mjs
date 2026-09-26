// The router's hash mode, guard, aliases and not-found route (issue 347), on the pure route-tree functions and on mountRouter with a fake window.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mountRouter, matchRoute, parseHash, buildHash, mapAlias, safeRoute, buildNavCrumbs } from '../modules/router/router.js';

const SCRIPT = 'java' + 'script:'; // built in two parts: the scanner flags a script address written out
const routes = [{ path: '/', label: 'Home', children: [
    { path: '/gallery', label: 'Gallery', children: [{ path: '/gallery/elements/:name', label: p => `Element ${p.name}` }] },
    { path: '/files', label: 'Files' },
    { path: '/admin', label: 'Admin' },
] }];

// A window whose listener count is observable; history writes update location.hash like a browser does (no event for pushState).
function fakeWin(hash = '') {
    const listeners = new Map();
    const win = {
        location: { hash, pathname: '/app', search: '', origin: 'http://x', href: 'http://x/app' + hash },
        history: {
            pushed: [], replaced: [],
            pushState: (s, t, u) => { win.history.pushed.push(u); win.location.hash = u; },
            replaceState: (s, t, u) => { win.history.replaced.push(u); win.location.hash = u; },
        },
        addEventListener: (t, f) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(f); },
        removeEventListener: (t, f) => listeners.get(t)?.delete(f),
        fire: t => [...(listeners.get(t) ?? [])].forEach(f => f()),
        count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    };
    globalThis.window = win;
    return win;
}

test('parseHash and buildHash round-trip a path and a query kept inside the hash', () => {
    assert.deepEqual(parseHash('#/gallery/elements/pk-button?nav=top&x=a%20b'), { path: '/gallery/elements/pk-button', query: { nav: 'top', x: 'a b' }, legacy: false });
    assert.deepEqual(parseHash(''), { path: '/', query: {}, legacy: false });
    assert.deepEqual(parseHash('#/a?b=c?d').query, { b: 'c?d' });
    assert.deepEqual(parseHash('#path=a.js&line=3'), { path: '/', query: { path: 'a.js', line: '3' }, legacy: true });
    assert.equal(parseHash('#/:id').path, '/:id');
    assert.equal(buildHash('/gallery', { nav: 'top', gone: null }), '#/gallery?nav=top');
    assert.equal(buildHash('/'), '#/');
});

test('a not-found route matches only when nothing else does, and an unknown path never throws', () => {
    const tree = [...routes, { path: '*', label: 'Nope' }];
    assert.equal(matchRoute(tree, '/files').node.label, 'Files');
    const m = matchRoute(tree, '/x/y/z');
    assert.equal(m.node.label, 'Nope');
    assert.equal(m.notFound, true);
    assert.equal(matchRoute(routes, '/x'), null);
    for (const bad of ['/%E0%A4%A', '/gallery/elements/%zz', '/__proto__', '/constructor', '/gallery/elements/..%2f..', '//', '/\u0000']) assert.doesNotThrow(() => matchRoute(tree, bad));
    assert.equal(matchRoute(tree, '/gallery/elements/%E0%A4%A').params.name, '%E0%A4%A');
});

test('hash mode reads the hash, navigates with pushState, follows hashchange and reports 404 as a match', () => {
    const win = fakeWin('#/gallery/elements/pk-button?nav=top');
    const router = mountRouter(null, { routes, mode: 'hash' });
    assert.deepEqual(router.current(), { path: '/gallery/elements/:name', url: '/gallery/elements/pk-button', params: { name: 'pk-button' }, query: { nav: 'top' }, label: 'Element pk-button', status: 200 });
    assert.deepEqual(router.crumbs().map(c => c.label), ['Home', 'Gallery', 'Element pk-button']);
    const seen = [];
    router.subscribe(r => seen.push(r.current().status));
    assert.equal(router.navigate('/files?a=1'), true);
    assert.deepEqual(win.history.pushed, ['#/files?a=1']);
    assert.deepEqual(router.current().query, { a: '1' });
    win.location.hash = '#/nowhere';
    win.fire('hashchange');
    assert.equal(router.current().status, 404);
    assert.equal(router.current().label, 'Not found');
    assert.deepEqual(seen, [200, 404]);
    assert.equal(router.href('/gallery/elements/:name', { name: 'a b' }, { nav: 'x' }), '#/gallery/elements/a%20b?nav=x');
    router.destroy();
});

test('a guard denies with 403 or redirects to an app path; anything but true denies; a throw denies; an open redirect is refused', () => {
    const win = fakeWin('#/admin');
    let verdict = { allow: false, redirect: '/files' };
    const router = mountRouter(null, { routes, mode: 'hash', guard: r => (r.path === '/admin' ? verdict : true) });
    assert.equal(router.current().path, '/files');
    assert.deepEqual(win.history.replaced, ['#/files']);
    assert.deepEqual(win.history.pushed, []);
    for (const v of [false, { allow: false }, undefined, 'yes', { allow: false, redirect: '//evil.example/x' }, { allow: false, redirect: 'https://evil.example' }, { allow: false, redirect: SCRIPT + 'alert(1)' }]) {
        verdict = v;
        win.location.hash = '#/admin';
        win.fire('hashchange');
        const c = router.current();
        assert.equal(c.status, 403, JSON.stringify(v));
        assert.equal(c.path, '/admin');
        assert.deepEqual(router.crumbs(), []);
    }
    verdict = true;
    win.fire('hashchange');
    assert.equal(router.current().status, 200);
    router.destroy();
    const throwing = mountRouter(null, { routes, mode: 'hash', guard: () => { throw new Error('boom'); } });
    assert.equal(throwing.current().status, 403);
    throwing.destroy();
});

test('a guard that redirects in a loop stops and denies', () => {
    fakeWin('#/admin');
    const router = mountRouter(null, { routes, mode: 'hash', guard: r => ({ allow: false, redirect: r.path === '/admin' ? '/files' : '/admin' }) });
    assert.equal(router.current().status, 403);
    router.destroy();
});

test('aliases map old hashes (params and query carried, address replaced), only to app-relative targets', () => {
    assert.equal(mapAlias({ '/elements/:name': '/gallery/elements/:name' }, '/elements/pk-button', { nav: 'top' }), '/gallery/elements/pk-button?nav=top');
    assert.equal(mapAlias({ '/x': '/y' }, '/z'), null);
    assert.equal(safeRoute('/a?b=1'), '/a?b=1');
    for (const bad of ['//evil', 'http://evil', SCRIPT + '1', '\\evil', ' //x', 'a/b', '/a\nb', '/\\x', null, 5, '']) assert.equal(safeRoute(bad), null, String(bad));

    const win = fakeWin('#/elements/pk-button?nav=top');
    const router = mountRouter(null, { routes, mode: 'hash', aliases: { '/elements/:name': '/gallery/elements/:name', '/': (p, q) => (q.path ? `/files?path=${encodeURIComponent(q.path)}&line=${encodeURIComponent(q.line ?? '')}` : null) } });
    assert.equal(router.current().url, '/gallery/elements/pk-button');
    assert.deepEqual(router.current().query, { nav: 'top' });
    assert.deepEqual(win.history.replaced, ['#/gallery/elements/pk-button?nav=top']);
    win.location.hash = '#path=a.js&line=3';
    win.fire('hashchange');
    assert.equal(router.current().path, '/files');
    assert.deepEqual(router.current().query, { path: 'a.js', line: '3' });
    router.destroy();

    fakeWin('#/old');
    const evil = mountRouter(null, { routes, mode: 'hash', aliases: { '/old': () => '//evil.example' } });
    assert.equal(evil.current().status, 404, 'an alias to another site is not followed');
    evil.destroy();
    fakeWin('#/a');
    const loop = mountRouter(null, { routes, mode: 'hash', aliases: { '/a': '/b', '/b': '/a' } });
    assert.ok(loop.current(), 'an alias loop stops');
    loop.destroy();
});

test('navigate refuses addresses that are not app-relative paths, in both modes', () => {
    const win = fakeWin('#/files');
    const router = mountRouter(null, { routes, mode: 'hash' });
    for (const bad of ['//evil', 'https://evil.example', SCRIPT + 'alert(1)', '\\\\x', undefined]) assert.equal(router.navigate(bad), false);
    assert.deepEqual(win.history.pushed, []);
    router.destroy();
    assert.equal(router.navigate('/files'), false, 'a destroyed router does nothing');
});

test('a nav tree gives the trail: groups without a route are crumbs without a link, and an unknown route gives none', () => {
    const nav = [{ id: 'g', title: 'Foundations', children: [{ id: 'c', title: 'Colour', route: '/foundations/colour' }, { id: 'e', title: 'Element', route: '/elements/:name', crumb: true }] }];
    assert.deepEqual(buildNavCrumbs(nav, '/foundations/colour'), [{ label: 'Foundations' }, { label: 'Colour' }]);
    assert.deepEqual(buildNavCrumbs(nav, '/nope'), []);
});

test('mode is validated, and path mode keeps working beside hash mode', () => {
    assert.throws(() => mountRouter(null, { routes, mode: 'history' }), TypeError);
    const win = fakeWin('');
    win.location.pathname = '/files';
    const router = mountRouter(null, { routes });
    assert.equal(router.current().label, 'Files');
    assert.equal(router.mode, 'path');
    router.destroy();
});

test('a route change is fast and destroy() leaves no listener, over 100 mount/unmount cycles', () => {
    const win = fakeWin('#/files');
    const clicks = new Set();
    const container = { addEventListener: (t, f) => clicks.add(f), removeEventListener: (t, f) => clicks.delete(f) };
    for (let i = 0; i < 100; i++) {
        const r = mountRouter(container, { routes, mode: i % 2 ? 'hash' : 'path', intercept: true });
        r.subscribe(() => {});
        r.destroy();
    }
    assert.equal(win.count(), 0);
    assert.equal(clicks.size, 0);

    const big = [{ path: '/', label: 'Home', children: Array.from({ length: 200 }, (_, i) => ({ path: `/m${i}`, label: `M${i}`, children: [{ path: `/m${i}/:id`, label: 'x' }] })) }];
    const router = mountRouter(null, { routes: big, mode: 'hash', guard: () => true, aliases: { '/old/:n': '/m1/:n' } });
    router.navigate('/m0/1'); // warm up
    const N = 200;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) router.navigate(`/m${i}/${i}?q=${i}`);
    const ms = (performance.now() - t0) / N;
    console.log(`route change, 200 modules x 2 routes, guard and aliases on: ${ms.toFixed(3)} ms mean over ${N}`);
    assert.ok(ms <= 5, `a route change took ${ms.toFixed(2)} ms, budget 5`);
    assert.equal(router.current().url, `/m${N - 1}/${N - 1}`);
    router.destroy();
    assert.equal(win.count(), 0);
});
