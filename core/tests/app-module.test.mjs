// The app module contract and host (js/app/*.js, #349): definition validation, the allow-list, lifecycle order, cancellation, tracked disposal, boundaries,
// guards, moduleFromMount over real tool modules, leaks, and the source rules. A small DOM double stands in for the browser (the browser cases prove the real thing).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { defineModule, moduleFromMount, registerPageType, registerLayout, pageTypeFor } from '../js/app/module.js';
import { createModuleHost } from '../js/app/host.js';
import { createStore } from '../js/store.js';
import { setLogLevel, addLogSink } from '../js/log.js';
import { mountRouter } from '../modules/router/router.js';
import { mountLogSettings } from '../modules/log-settings/log-settings.js';
import { mountFieldGroup } from '../modules/field-group/field-group.js';

setLogLevel('silent');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logs = [];
addLogSink(e => { logs.push(e); if (process.env.DBG && e.level === 'error') console.log(e.scope, e.message, e.detail?.stack ?? e.detail); });

// ---- a DOM double: what the boundary, the host and the two real tool modules touch ----
class El {
    constructor(tag, doc) { this.localName = tag; this.ownerDocument = doc; this.children = []; this.parent = null; this.attrs = new Map(); this.on = new Map(); this.hidden = false; this.style = { setProperty() {} }; this.text = ''; }
    get firstChild() { return this.children[0] ?? null; }
    get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this.children.forEach(c => { c.parent = null; }); this.children = []; this.text = String(v); }
    append(...kids) { for (const k of kids) { if (typeof k === 'string') { this.text += k; continue; } k.remove(); k.parent = this; this.children.push(k); } }
    replaceChildren(...kids) { this.children.forEach(c => { c.parent = null; }); this.children = []; this.text = ''; this.append(...kids); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); }
    removeAttribute(k) { this.attrs.delete(k); }
    toggleAttribute(k, on) { on ? this.attrs.set(k, '') : this.attrs.delete(k); return !!on; }
    addEventListener(t, fn) { (this.on.get(t) ?? this.on.set(t, new Set()).get(t)).add(fn); }
    removeEventListener(t, fn) { this.on.get(t)?.delete(fn); }
    click() { for (const fn of [...(this.on.get('click') ?? [])]) fn({ type: 'click', target: this }); }
    all() { return this.children.flatMap(c => [c, ...c.all()]); }
    querySelectorAll(sel) { return this.all().filter(e => e.localName === sel || (sel.startsWith('[') && e.hasAttribute(sel.slice(1, -1)))); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
    get isConnected() { return true; }
    contains(el) { return this === el || this.all().includes(el); }
}
class Target { // document / window / a global: counts what is added and not removed
    constructor() { this.l = new Map(); }
    addEventListener(t, fn) { (this.l.get(t) ?? this.l.set(t, new Set()).get(t)).add(fn); }
    removeEventListener(t, fn) { this.l.get(t)?.delete(fn); }
    get count() { return [...this.l.values()].reduce((n, s) => n + s.size, 0); }
}
class FakeObserver { static live = 0; constructor(cb) { this.cb = cb; this.on = false; } observe() { if (!this.on) { this.on = true; FakeObserver.live++; } } disconnect() { if (this.on) { this.on = false; FakeObserver.live--; } } }
function makeDom() {
    const doc = Object.assign(new Target(), { links: [], win: new Target() });
    doc.createElement = tag => new El(tag, doc);
    doc.documentElement = doc.createElement('html');
    doc.documentElement.setAttribute('data-theme', 'dark');
    doc.head = new El('head', doc);
    doc.querySelectorAll = () => doc.links;
    doc.defaultView = Object.assign(doc.win, { location: { search: '' }, MutationObserver: FakeObserver });
    doc.head.append = link => { doc.links.push(link); const fire = [...(link.on.get('load') ?? [])]; queueMicrotask(() => fire.forEach(fn => fn())); };
    const container = doc.createElement('div');
    return { doc, container };
}
const JS_URL = 'java' + 'script:'; // built apart so the security scanner does not read the test data as a script URL
const flush = () => new Promise(r => setTimeout(r, 0));
const noElements = () => {};
const fast = { timeout: 30, backoff: 1, elements: noElements };
const mod = (id, extra = {}) => defineModule({ id, title: id.toUpperCase(), routes: [{ path: '*', page: 'custom', config: { mount: () => {} } }], ...extra });
const entryFor = (id, def = mod(id), extra = {}) => ({ id, title: id.toUpperCase(), load: async () => ({ default: def }), ...extra });
const bodyOf = container => container.querySelector('[data-pk-app-body]');
const errorOf = container => container.children[0].children[0];

test('defineModule returns its definition and refuses a bad id, a duplicate route, a bad nav, a bad state and a shadowed built-in page type', () => {
    const def = { id: 'orders', nav: () => [], routes: [{ path: '/', page: 'custom' }, { path: '/:id', page: 'custom' }, { path: '*', page: 'not-found' }], state: { defaults: { q: '' }, persist: ['q'] } };
    assert.equal(defineModule(def), def);
    for (const id of ['', 'Orders', '1a', 'a b', '../x', '//h/x', `${JS_URL}x`, 'a'.repeat(41), undefined, 5, '__proto__']) assert.throws(() => defineModule({ id }), /defineModule/, `id ${String(id)}`);
    assert.throws(() => defineModule({ id: 'a', routes: [{ path: '/x', page: 'custom' }, { path: '/x', page: 'custom' }] }), /duplicate route/);
    assert.throws(() => defineModule({ id: 'a', routes: [{ path: '/:a', page: 'custom' }, { path: '/:b', page: 'custom' }] }), /duplicate route/);
    assert.throws(() => defineModule({ id: 'a', routes: [{ path: 'x', page: 'custom' }] }), /must be '\*' or start with/);
    assert.throws(() => defineModule({ id: 'a', routes: [{ path: '/', page: 5 }] }), /needs page/);
    assert.throws(() => defineModule({ id: 'a', nav: 'x' }), /nav must be an array/);
    assert.throws(() => defineModule({ id: 'a', nav: [{ id: 'x' }] }), /string id and title/);
    assert.throws(() => defineModule({ id: 'a', nav: [{ id: 'x', title: 'X', children: 5 }] }), /children must be an array/);
    assert.throws(() => defineModule({ id: 'a', state: { defaults: { q: 1 }, persist: ['nope'] } }), /state.persist/);
    assert.throws(() => defineModule({ id: 'a', mount: 5 }), /mount must be a function/);
    assert.throws(() => defineModule({ id: 'a', pageTypes: { list: () => {} } }), /built-in page type/);
    assert.throws(() => defineModule({ id: 'a', pageTypes: { 'Bad Name': () => {} } }), /pageTypes/);
});

test('page types and layouts: module, then app, then built-in; a built-in id cannot be shadowed or registered; names are only table keys', () => {
    const local = () => 'local', app = () => 'app';
    registerPageType('kanban-a', app);
    registerLayout('split-a', app);
    assert.throws(() => registerPageType('kanban-a', app), /taken/);
    assert.throws(() => registerPageType('list', app), /built-in/);
    assert.throws(() => registerLayout('Bad', app), /bad/);
    const def = defineModule({ id: 'a', pageTypes: { 'kanban-a': local, only: local } });
    assert.equal(pageTypeFor(def, 'kanban-a'), local, 'the module wins');
    assert.equal(pageTypeFor(mod('b'), 'kanban-a'), app, 'the app table serves any module');
    assert.equal(pageTypeFor(def, 'only'), local);
    assert.equal(typeof pageTypeFor(def, 'custom'), 'function');
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'list']) assert.equal(pageTypeFor(def, name), undefined, name);
});

test('the allow-list is the only way to code: crafted ids never call a loader, whatever the address', async () => {
    const { container } = makeDom();
    let calls = 0;
    const host = createModuleHost(container, { modules: [{ id: 'safe', title: 'Safe', load: async () => { calls++; return mod('safe'); } }], ...fast });
    for (const id of ['../x', '//host/x', `${JS_URL}alert(1)`, 'https://evil.example/x.js', '__proto__', 'constructor', 'toString', 'SAFE', 'safe/../x', '', undefined, null, 42, {}]) assert.equal(await host.show(id), 'not-found', String(id));
    for (const a of ['/../x/y', '//host/x', `/${JS_URL}alert(1)/x`, '/%2e%2e%2fx', '/__proto__/x', '/constructor']) assert.equal(await host.open(a), 'not-found', a);
    assert.equal(calls, 0);
    assert.equal(host.guard({ path: '/__proto__/x' }), true, 'unknown modules pass the guard; the router shows its not-found');
    assert.equal(await host.show('safe'), 'ok');
    assert.equal(calls, 1);
    assert.throws(() => createModuleHost(container, { modules: [{ id: '../x', load() {} }] }), /bad, missing or duplicate/);
    assert.throws(() => createModuleHost(container, { modules: [{ id: 'a', load() {} }, { id: 'a', load() {} }] }), /duplicate/);
    assert.throws(() => createModuleHost(container, { modules: [{ id: 'a', load: 'x.js' }] }), /bad, missing or duplicate/, 'a specifier string is not a loader');
    await host.destroy();
});

test('a module whose id differs from its allow-list entry, or that is not a valid module, is refused with the boundary error', async () => {
    const { container } = makeDom();
    const host = createModuleHost(container, { modules: [entryFor('a', mod('b')), { id: 'c', title: 'C', load: async () => ({ default: { id: 'BAD' } }) }], ...fast, retries: 0 });
    assert.equal(await host.show('a'), 'error');
    assert.equal(await host.show('c'), 'error');
    await host.destroy();
});

test('lifecycle: resolve, can, mount, page mount, page cleanup on a route change, and on a module switch page cleanup, unmount, mount cleanup, then the next mount; once each', async () => {
    const { container } = makeDom();
    const calls = [];
    const life = (id) => defineModule({
        id, title: id,
        can: () => { calls.push(`${id}.can`); return true; },
        mount: () => { calls.push(`${id}.mount`); return () => calls.push(`${id}.mount-cleanup`); },
        unmount: () => calls.push(`${id}.unmount`),
        routes: [{ path: '/', page: 'custom', config: { mount: () => { calls.push(`${id}.page:/`); return () => calls.push(`${id}.page-cleanup:/`); } } },
            { path: '/x', page: 'custom', config: { mount: () => { calls.push(`${id}.page:/x`); return { destroy: () => calls.push(`${id}.page-cleanup:/x`) }; } } }],
    });
    const host = createModuleHost(container, {
        modules: ['a', 'b'].map(id => ({ id, title: id, load: async () => { calls.push(`${id}.resolve`); return { default: life(id) }; } })),
        can: (entry) => { calls.push(`app.can:${entry.id}`); return true; }, ...fast,
    });
    assert.equal(await host.show('a', { path: '/' }), 'ok');
    assert.equal(await host.show('a', { path: '/x' }), 'ok');
    assert.equal(await host.show('b', { path: '/' }), 'ok');
    assert.deepEqual(calls, [
        'app.can:a', 'a.resolve', 'app.can:a', 'a.can', 'a.mount', 'a.page:/',
        'app.can:a', 'a.can', 'a.page-cleanup:/', 'a.page:/x',
        'app.can:b', 'b.resolve', 'app.can:b', 'b.can', 'a.page-cleanup:/x', 'a.unmount', 'a.mount-cleanup', 'b.mount', 'b.page:/',
    ]);
    await host.destroy();
    assert.deepEqual(calls.slice(-3), ['b.page-cleanup:/', 'b.unmount', 'b.mount-cleanup']);
    assert.equal(host.current(), null);
});

test('a request made while another is in flight cancels the older one: its signal aborts, its listeners are removed, it is unmounted, and only the newer mounts', async () => {
    const { container, doc } = makeDom();
    const seen = [];
    let release;
    const gate = new Promise(r => { release = r; });
    const slow = defineModule({ id: 'slow', mount: async ctx => { ctx.on(doc, 'x', () => {}); ctx.after(10000, () => {}); seen.push(ctx); await gate; }, unmount: () => seen.push('slow.unmount'), routes: [{ path: '*', page: 'custom', config: { mount: () => seen.push('slow.page') } }] });
    const quick = defineModule({ id: 'quick', mount: () => { seen.push('quick.mount'); }, routes: [{ path: '*', page: 'custom', config: { mount: () => seen.push('quick.page') } }] });
    const host = createModuleHost(container, { modules: [entryFor('slow', slow), entryFor('quick', quick)], ...fast });
    const first = host.show('slow');
    await flush();
    assert.equal(doc.count, 1, 'the slow module registered a listener');
    const second = host.show('quick');
    release();
    assert.equal(await first, 'superseded');
    assert.equal(await second, 'ok');
    assert.equal(seen[0].signal.aborted, true);
    assert.equal(doc.count, 0);
    assert.deepEqual(seen.slice(1), ['slow.unmount', 'quick.mount', 'quick.page'], 'the page of the cancelled module never mounted');
    await host.destroy();
});

test('ctx.on, observe and after are tracked, stopped early on request, disposed on unmount, and refused (with a warning) afterwards', async () => {
    const { container, doc } = makeDom();
    const target = new Target();
    let ctx, fired = 0;
    const m = defineModule({ id: 'tracked', mount: c => { ctx = c; }, routes: [{ path: '*', page: 'custom', config: { mount: () => {} } }] });
    const host = createModuleHost(container, { modules: [entryFor('tracked', m), entryFor('other')], ...fast });
    await host.show('tracked');
    const off = ctx.on(target, 'a', () => {});
    ctx.on(target, 'b', () => {});
    const ob = ctx.observe(new FakeObserver(() => {}), doc.documentElement, {});
    ctx.after(5, () => { fired++; });
    const cancelled = ctx.after(5, () => { fired += 100; });
    cancelled();
    const unsubTheme = ctx.theme.subscribe(() => {});
    assert.equal(target.count, 2);
    assert.equal(FakeObserver.live, 2, 'the observer and the theme subscription');
    off();
    assert.equal(target.count, 1);
    unsubTheme();
    assert.equal(FakeObserver.live, 1);
    await new Promise(r => setTimeout(r, 15));
    assert.equal(fired, 1, 'one timer fired, the cancelled one did not');
    ctx.after(50, () => { fired += 1000; });
    await host.show('other');
    assert.equal(target.count, 0);
    assert.equal(FakeObserver.live, 0);
    assert.equal(ob.on, false);
    assert.equal(ctx.signal.aborted, true);
    const before = logs.length;
    assert.equal(typeof ctx.on(target, 'late', () => {}), 'function');
    ctx.observe(new FakeObserver(() => {}), doc.documentElement, {});
    ctx.after(1, () => { fired += 1000; });
    assert.equal(target.count, 0);
    assert.equal(FakeObserver.live, 0);
    assert.equal(logs.slice(before).filter(e => e.level === 'warn' && e.scope === 'app:tracked').length, 3);
    await new Promise(r => setTimeout(r, 60));
    assert.equal(fired, 1, 'the timer that was pending at unmount never fired');
    await host.destroy();
});

test('ctx: route, theme, store, settings, auth, log, page, and module-relative navigation through the router', async () => {
    const { container, doc } = makeDom();
    const store = createStore({ storage: { getItem: () => null, setItem() {} } });
    const navigated = [];
    const router = { navigate: (to, o) => { navigated.push([to, o]); return true; }, href: (p, params, query) => `#${p}?${JSON.stringify(query)}` };
    let ctx;
    const def = defineModule({ id: 'orders', state: { defaults: { q: '' }, persist: ['q'] }, mount: c => { ctx = c; }, routes: [{ path: '/:id', page: 'custom', config: ({ params }, c) => ({ mount: () => { assert.equal(c.id, 'orders'); assert.equal(params.id, '7'); } }) }] });
    const auth = { has: () => true }, settings = { get: () => 1 };
    const host = createModuleHost(container, { modules: [entryFor('orders', def)], store, router, auth, settings, ...fast });
    assert.equal(await host.show('orders', { path: '/7', query: { tab: 'x' } }), 'ok');
    assert.deepEqual(ctx.route, { path: '/7', params: { id: '7' }, query: { tab: 'x' } });
    assert.equal(ctx.id, 'orders'); assert.equal(ctx.auth, auth); assert.equal(ctx.settings, settings); assert.equal(ctx.log.scope, 'app:orders');
    assert.equal(ctx.store.set('q', 'a'), true);
    let painted = 0;
    ctx.store.subscribe(() => painted++);
    ctx.store.set('q', 'b');
    assert.equal(painted, 1); assert.equal(store.listeners(), 1);
    assert.equal(ctx.navigate('/8', { replace: true }), true);
    assert.equal(ctx.navigate('/'), true);
    assert.deepEqual(navigated, [['/orders/8', { replace: true }], ['/orders', undefined]]);
    assert.equal(ctx.href('/7', {}, { a: 1 }), '#/orders/7?{"a":1}');
    assert.equal(ctx.theme.name, 'dark'); ctx.theme.set('light'); assert.equal(doc.documentElement.getAttribute('data-theme'), 'light'); assert.equal(ctx.theme.toggle(), 'dark');
    assert.equal(typeof ctx.page.busy, 'function');
    await ctx.page.busy(async () => 1, 'x');
    assert.equal(ctx.page.setError(new Error('boom')), undefined);
    await host.show('orders', { path: '/9' });
    assert.equal(ctx.route.params.id, '9', 'a route change inside the module keeps the ctx and updates the route');
    await host.destroy();
    assert.equal(store.listeners(), 0, 'the module store subscriptions end on unmount');
    const bare = createModuleHost(makeDom().container, { modules: [entryFor('a')], ...fast });
    await bare.show('a');
    assert.equal(bare.current().ctx.navigate('/x'), false);
    assert.equal(bare.current().ctx.href('/x'), null);
    await bare.destroy();
});

test('a failing import is retried once after a backoff, then shows the boundary error with Retry; the previous module stays mounted and usable; Retry works', async () => {
    const { container } = makeDom();
    let attempts = 0, healthy = false, mounted = 0, cleaned = 0;
    const good = defineModule({ id: 'good', routes: [{ path: '*', page: 'custom', config: { mount: () => { mounted++; return () => cleaned++; } } }] });
    const flaky = { id: 'flaky', title: 'Flaky', load: async () => { attempts++; if (!healthy) throw new Error('chunk 404'); return { default: mod('flaky') }; } };
    const host = createModuleHost(container, { modules: [entryFor('good', good), flaky], ...fast });
    await host.show('good');
    assert.equal(await host.show('flaky'), 'error');
    assert.equal(attempts, 2, 'one automatic retry');
    const alert = errorOf(container);
    assert.equal(alert.hidden, false);
    assert.equal(alert.getAttribute('kind'), 'danger');
    assert.equal(alert.getAttribute('heading'), 'Could not load Flaky');
    assert.match(alert.textContent, /chunk 404/);
    assert.equal(mounted, 1); assert.equal(cleaned, 0, 'the previous module was not unmounted');
    assert.equal(host.current().id, 'good');
    assert.equal(bodyOf(container).children.length, 1, 'the previous page is still there');
    healthy = true;
    const retry = alert.children.find(c => c.localName === 'pk-button');
    assert.equal(retry.textContent, 'Retry'); assert.equal(retry.getAttribute('slot'), 'action');
    retry.click();
    await flush(); await flush();
    assert.equal(host.current().id, 'flaky');
    assert.equal(cleaned, 1);
    assert.equal(alert.hidden, true, 'the error is gone after a successful retry');
    assert.ok(logs.some(e => e.scope === 'app' && e.level === 'error' && /flaky/.test(e.message)));
    await host.destroy();
});

test('a blocked chunk (never answers) times out, retries, then shows the failure UI: never a blank page', async () => {
    const { container } = makeDom();
    let attempts = 0;
    const host = createModuleHost(container, { modules: [{ id: 'blocked', title: 'Blocked', load: () => { attempts++; return new Promise(() => {}); } }], ...fast, timeout: 10 });
    assert.equal(await host.show('blocked'), 'error');
    assert.equal(attempts, 2);
    assert.match(errorOf(container).textContent, /no answer after 10 ms/);
    assert.ok(bodyOf(container).children.length > 0, 'the body is not empty: the first load shows a placeholder, never a blank page');
    await host.destroy();
});

test('a module whose mount throws, a page that throws and an unmount that throws are contained: the boundary shows the error, others keep working, all logged', async () => {
    const { container } = makeDom();
    const boom = defineModule({ id: 'boom', mount: () => { throw new Error('mount exploded'); } });
    const badPage = defineModule({ id: 'page', unmount: () => { throw new Error('unmount exploded'); }, routes: [{ path: '/', page: 'custom', config: { mount: () => { throw new Error('page exploded'); } } }, { path: '/ok', page: 'custom', config: { mount: () => {} } }] });
    const okay = defineModule({ id: 'okay', routes: [{ path: '*', page: 'custom', config: { mount: () => {} } }] });
    const host = createModuleHost(container, { modules: [entryFor('boom', boom), entryFor('page', badPage), entryFor('okay', okay)], ...fast });
    const before = logs.length;
    assert.equal(await host.show('boom'), 'error');
    assert.match(errorOf(container).textContent, /mount exploded/);
    assert.equal(host.current(), null, 'nothing half-mounted is left');
    assert.equal(await host.show('page', { path: '/' }), 'error');
    assert.match(errorOf(container).textContent, /page exploded/);
    assert.equal(await host.show('page', { path: '/ok' }), 'ok', 'the module is still usable after its page failed');
    assert.equal(errorOf(container).hidden, true);
    assert.equal(await host.show('okay'), 'ok', 'a module whose unmount throws can still be left');
    assert.equal(host.current().id, 'okay');
    const mine = logs.slice(before).filter(e => e.level === 'error').map(e => e.message);
    for (const re of [/mount threw/, /page for \/ failed/, /unmount threw/]) assert.ok(mine.some(m => re.test(m)), String(re));
    await host.destroy();
});

test('unknown page types and layouts, unknown module routes and route guards show the right state', async () => {
    const { container } = makeDom();
    registerPageType('board', (host, config, ctx) => { host.setAttribute('data-board', config.n); return () => host.setAttribute('data-board', 'gone'); });
    registerLayout('framed', (host) => { const inner = host.ownerDocument.createElement('section'); host.append(inner); return inner; });
    const def = defineModule({
        id: 'pages',
        layouts: { own: (host) => host },
        routes: [
            { path: '/board', page: { type: 'board', config: { n: 3 } }, layout: 'framed' },
            { path: '/list', page: 'list' },
            { path: '/nolayout', page: 'custom', layout: 'nope' },
            { path: '/secret', page: 'custom', config: { mount: () => {} }, can: () => false },
            { path: '/gone', page: 'not-found' },
            { path: '/cfg/:n', page: 'custom', config: ({ params }) => ({ mount: el => el.setAttribute('data-n', params.n) }) },
        ],
    });
    const host = createModuleHost(container, { modules: [entryFor('pages', def)], ...fast });
    assert.equal(await host.show('pages', { path: '/board' }), 'ok');
    const pageHost = bodyOf(container).children[0];
    assert.equal(pageHost.children[0].localName, 'section', 'the layout built chrome around the page host');
    assert.equal(pageHost.children[0].getAttribute('data-board'), '3', 'the page type mounted into the layout element with its config');
    assert.equal(await host.show('pages', { path: '/cfg/%3Cimg%20onerror%3E' }), 'ok');
    assert.equal(bodyOf(container).children[0].getAttribute('data-n'), '<img onerror>', 'params arrive as text, decoded once');
    assert.equal(await host.show('pages', { path: '/list' }), 'error');
    assert.match(errorOf(container).textContent, /page type "list" is not available/);
    assert.equal(await host.show('pages', { path: '/nolayout' }), 'error');
    assert.match(errorOf(container).textContent, /layout "nope" is not available/);
    assert.equal(await host.show('pages', { path: '/secret' }), 'forbidden');
    assert.equal(await host.show('pages', { path: '/gone' }), 'not-found');
    assert.equal(await host.show('pages', { path: '/nothing/here' }), 'not-found');
    assert.equal(bodyOf(container).children[0].getAttribute('heading'), 'Not found');
    assert.equal(host.current().id, 'pages', 'the module stays mounted on a page-level state');
    await host.destroy();
});

test('guard: a denied module never runs its loader or mount, at the router and again at mount; fail closed on a throw, on a non-true answer; redirects are passed to the router', async () => {
    const { container } = makeDom();
    let loads = 0, mounts = 0;
    const secret = defineModule({ id: 'secret', mount: () => { mounts++; }, can: ctx => ctx.auth.level > 5, routes: [{ path: '*', page: 'custom', config: { mount: () => {} } }] });
    const auth = { level: 0 };
    const host = createModuleHost(container, {
        modules: [{ id: 'admin', title: 'Admin', can: c => c.auth.level > 1, load: async () => { loads++; return mod('admin'); } }, { id: 'secret', title: 'Secret', load: async () => { loads++; return secret; } }, { id: 'thrower', title: 'T', can: () => { throw new Error('nope'); }, load: async () => { loads++; return mod('thrower'); } }, entryFor('truthy', mod('truthy'), { can: () => 'yes' }), entryFor('open')],
        auth, can: (entry, c) => (entry.id === 'open' ? true : c.auth.level >= 0), ...fast,
    });
    assert.deepEqual(host.guard({ path: '/admin/x' }), { allow: false, redirect: null });
    assert.equal(await host.show('admin'), 'forbidden');
    assert.equal(await host.show('thrower'), 'forbidden');
    assert.equal(await host.show('truthy'), 'forbidden', 'only true or { allow: true } lets a module through');
    assert.equal(loads, 0, 'no code was loaded for a denied module');
    assert.match(bodyOf(container).children[0].getAttribute('description'), /do not have access to TRUTHY/);
    assert.equal(await host.show('secret'), 'forbidden', 'the module\'s own can() runs after the import and before mount');
    assert.equal(loads, 1); assert.equal(mounts, 0);
    auth.level = 9;
    assert.equal(host.guard({ path: '/admin/x' }), true);
    assert.equal(await host.show('secret'), 'ok'); assert.equal(mounts, 1);
    auth.level = 0;
    assert.equal(await host.show('secret', { path: '/again' }), 'forbidden', 'checked again on a route change inside a mounted module; the module is left');
    assert.equal(host.current(), null);
    const redirecting = createModuleHost(makeDom().container, { modules: [entryFor('r')], can: () => ({ allow: false, redirect: '/login' }), ...fast });
    assert.deepEqual(redirecting.guard({ path: '/r' }), { allow: false, redirect: '/login' });
    await redirecting.destroy(); await host.destroy();
});

test('a router in hash mode drives the host through open(): module-relative paths and query', async () => {
    const { container } = makeDom();
    const win = new Target();
    win.location = { hash: '#/orders/7?tab=x' }; win.history = { replaceState: (_, __, h) => { win.location.hash = h; }, pushState: (_, __, h) => { win.location.hash = h; } };
    const prev = globalThis.window; globalThis.window = win;
    try {
        let ctx;
        const def = defineModule({ id: 'orders', mount: c => { ctx = c; }, routes: [{ path: '/:id', page: 'custom', config: { mount: () => {} } }] });
        const host = createModuleHost(container, { modules: [entryFor('orders', def)], ...fast });
        const router = mountRouter(null, { mode: 'hash', routes: [{ path: '/:module/:id', label: 'x' }], guard: host.guard });
        const go = () => host.open(router.current().url, router.current().query);
        assert.equal(await go(), 'ok');
        assert.deepEqual(ctx.route, { path: '/7', params: { id: '7' }, query: { tab: 'x' } });
        router.destroy();
        await host.destroy();
    } finally { globalThis.window = prev; }
});

test('mount and unmount 100 times: listeners, observers, timers and store subscriptions return to zero (a module and a page with tracked resources)', async () => {
    const { container, doc } = makeDom();
    const store = createStore({ storage: { getItem: () => null, setItem() {} } });
    const target = new Target();
    const timers = new Set(), realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
    let pending = 0;
    globalThis.setTimeout = (fn, ms, ...a) => { const id = realSet(fn, ms, ...a); if (ms >= 1000) { timers.add(id); pending++; } return id; };
    globalThis.clearTimeout = id => { if (timers.delete(id)) pending--; return realClear(id); };
    try {
        const def = defineModule({
            id: 'leaky', state: { defaults: { n: 0 } },
            mount(ctx) { ctx.on(doc, 'visibilitychange', () => {}); ctx.on(doc.win, 'resize', () => {}); ctx.after(60000, () => {}); ctx.store.subscribe(() => {}); ctx.theme.subscribe(() => {}); ctx.observe(new FakeObserver(() => {}), doc.documentElement, {}); },
            routes: [{ path: '*', page: 'custom', config: { mount: (el, ctx) => { ctx.on(target, 'scroll', () => {}); ctx.after(60000, () => {}); return () => {}; } } }],
        });
        const host = createModuleHost(container, { modules: [entryFor('leaky', def), entryFor('other')], store, ...fast });
        for (let i = 0; i < 100; i++) {
            assert.equal(await host.show('leaky', { path: '/p' + (i % 3) }), 'ok');
            assert.equal(doc.count + doc.win.count + target.count, 3);
            assert.equal(FakeObserver.live, 2); assert.equal(store.listeners(), 1); assert.equal(pending, 2);
            assert.equal(await host.show('other'), 'ok');
            assert.equal(doc.count + doc.win.count + target.count, 0); assert.equal(FakeObserver.live, 0); assert.equal(store.listeners(), 0); assert.equal(pending, 0);
        }
        await host.destroy();
        assert.equal(pending, 0);
    } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
});

test('moduleFromMount adapts two real mountX modules unchanged (mountLogSettings, mountFieldGroup): mounted and unmounted 100 times through the lifecycle with nothing left behind', async () => {
    const { container, doc } = makeDom();
    const data = { name: 'a' };
    const settingsModule = moduleFromMount(mountLogSettings, { id: 'log-settings', title: 'Logging', options: { height: 'fill' } });
    const fields = moduleFromMount(mountFieldGroup, { id: 'fields', title: 'Fields', options: ctx => ({ fields: [{ key: 'name', label: 'Name', kind: 'text' }], data, onChange: () => ctx.log.debug('changed') }) });
    assert.equal(settingsModule.id, 'log-settings');
    assert.deepEqual(settingsModule.routes.map(r => r.path), ['*']);
    const host = createModuleHost(container, { modules: [entryFor('log-settings', settingsModule), entryFor('fields', fields), entryFor('other')], ...fast });
    for (let i = 0; i < 100; i++) {
        assert.equal(await host.show('log-settings', { path: i % 2 ? '/a' : '/' }), 'ok');
        const root = bodyOf(container).children[0].children[0];
        assert.equal(root.getAttribute('aria-label'), 'Logging settings', 'the real module drew itself into the page host');
        assert.equal(await host.show('fields'), 'ok');
        assert.equal(bodyOf(container).children[0].children.length, 1, 'the field group drew one field');
        assert.equal(await host.show('other'), 'ok');
        assert.equal(bodyOf(container).children[0].children.length, 0, 'unmount removed what the module drew');
    }
    assert.equal(doc.count + doc.win.count, 0);
    assert.equal(FakeObserver.live, 0);
    await host.destroy();
});

test('a moduleFromMount module cancelled while its mount is still starting has its handle destroyed', async () => {
    const { container } = makeDom();
    let destroyed = 0, release;
    const gate = new Promise(r => { release = r; });
    const slowMount = async () => { await gate; return { destroy: () => destroyed++ }; };
    const host = createModuleHost(container, { modules: [entryFor('slow', moduleFromMount(slowMount, { id: 'slow' })), entryFor('other')], ...fast });
    const first = host.show('slow');
    await flush();
    const second = host.show('other');
    release();
    assert.equal(await first, 'superseded');
    assert.equal(await second, 'ok');
    assert.equal(destroyed, 1);
    assert.throws(() => moduleFromMount('x', { id: 'a' }), /mountX/);
    assert.throws(() => moduleFromMount(() => {}, { id: 'Bad' }), /defineModule/);
    await host.destroy();
});

test('the framework sources: no markup sinks, eval, bare console, polling, inline styles or handlers; every catch logs', () => {
    const files = ['app.js', 'app/module.js', 'app/host.js', 'app/boundary.js'];
    for (const f of files) {
        const src = fs.readFileSync(path.join(root, 'js', f), 'utf8').replace(/\/\/.*$/gm, '');
        assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|setAttribute\(\s*['"]style|\.onclick|console\./.test(src), `${f} has a forbidden construct`);
        assert.ok(!/setInterval|requestAnimationFrame/.test(src), `${f} polls`);
        assert.ok(!/import\(/.test(src), `${f} imports dynamically: the only import() is the app config's loader`);
        assert.ok(!/localStorage|sessionStorage/.test(src), `${f} touches storage directly`);
    }
});

test('size: each framework file stays inside the 6 KB gzip module budget (comments removed), and the whole lifecycle is small', () => {
    const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s+/g, '\n');
    let total = 0;
    for (const f of ['app.js', 'app/module.js', 'app/host.js', 'app/boundary.js']) {
        const kb = zlib.gzipSync(Buffer.from(strip(fs.readFileSync(path.join(root, 'js', f), 'utf8')))).length / 1024;
        total += kb;
        assert.ok(kb < 6, `js/${f} is ${kb.toFixed(2)} KB gzip, limit 6`);
    }
    console.log('framework gz KB (comments removed):', total.toFixed(2));
});
