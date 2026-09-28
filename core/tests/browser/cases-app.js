// Browser cases for the app module host (js/app/*.js, #349): what needs real elements, real dynamic imports and real observers. Same contract as cases.js:
// [name, async (t) => void]. The node test (tests/app-module.test.mjs) proves the logic against a DOM double; these prove it in a browser, with the tool modules from dist.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, tries = 100) => { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(30); } throw new Error(`timed out waiting for ${what}`); };
const dist = path => import(new URL(`../../dist/${path}`, import.meta.url).href);
const fast = { timeout: 300, backoff: 20 };

// Counts what a module could leak: listeners on window, document, <html> and <body>; live observers (mutation, resize, intersection, performance) that watch something still in the page
// (an element's observer of its own removed subtree is freed with the element, not counted); intervals and long timers.
export function instrument() {
    const listeners = new Set(), ids = new WeakMap(), timers = new Set(), observing = new Map();
    let n = 0;
    const id = fn => ids.get(fn) ?? (ids.set(fn, ++n), n);
    const watched = t => t === window || t === document || t === document.documentElement || t === document.body;
    const name = t => (t === window ? 'window' : t === document ? 'document' : t.localName);
    const cap = o => (typeof o === 'boolean' ? o : Boolean(o?.capture));
    const EP = EventTarget.prototype, add = EP.addEventListener, rem = EP.removeEventListener;
    EP.addEventListener = function (type, fn, o) { if (fn && watched(this) && !o?.once && !o?.signal) listeners.add(`${name(this)}|${type}|${id(fn)}|${cap(o)}`); return add.call(this, type, fn, o); };
    EP.removeEventListener = function (type, fn, o) { if (fn && watched(this)) listeners.delete(`${name(this)}|${type}|${id(fn)}|${cap(o)}`); return rem.call(this, type, fn, o); };
    const restore = [() => { EP.addEventListener = add; EP.removeEventListener = rem; }];
    for (const C of [MutationObserver, ResizeObserver, IntersectionObserver, PerformanceObserver]) {
        const { observe, disconnect } = C.prototype;
        C.prototype.observe = function (...a) { (observing.get(this) ?? observing.set(this, new Set()).get(this)).add(a[0]); return observe.apply(this, a); };
        C.prototype.disconnect = function () { observing.delete(this); return disconnect.call(this); };
        restore.push(() => { C.prototype.observe = observe; C.prototype.disconnect = disconnect; });
    }
    const { setTimeout: st, setInterval: si, clearTimeout: ct, clearInterval: ci } = window;
    window.setTimeout = (fn, ms, ...a) => { const h = st(() => { timers.delete(h); return typeof fn === 'function' ? fn(...a) : undefined; }, ms); if (ms >= 1000) timers.add(h); return h; };
    window.setInterval = (fn, ms, ...a) => { const h = si(fn, ms, ...a); timers.add(h); return h; };
    window.clearTimeout = h => { timers.delete(h); return ct(h); };
    window.clearInterval = h => { timers.delete(h); return ci(h); };
    restore.push(() => { window.setTimeout = st; window.setInterval = si; window.clearTimeout = ct; window.clearInterval = ci; });
    const live = () => [...observing.values()].filter(targets => [...targets].some(x => !(x instanceof Node) || x.isConnected)).length;
    return { snapshot: () => ({ listeners: [...listeners].sort(), observers: live(), timers: timers.size }), restore: () => restore.forEach(fn => fn()) };
}

export const appCases = [
    ['app host: a module and two adapted tool modules mounted and unmounted 100 times leave no listener, observer or timer behind, and each route change stays fast', async t => {
        const { createModuleHost, defineModule, moduleFromMount } = await dist('js/app.js');
        const { mountLogSettings } = await dist('modules/log-settings/log-settings.js');
        const { mountConsole } = await dist('modules/console/console.js');
        const { createStore } = await dist('js/store.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const store = createStore({ storage: { getItem: () => null, setItem() {} } });
        const own = defineModule({
            id: 'own', title: 'Own', state: { defaults: { n: 0 } },
            mount(ctx) { ctx.on(window, 'resize', () => {}); ctx.on(document, 'visibilitychange', () => {}); ctx.observe(new MutationObserver(() => {}), document.documentElement, { attributes: true }); ctx.observe(new ResizeObserver(() => {}), el); ctx.after(60000, () => {}); ctx.store.subscribe(() => {}); ctx.theme.subscribe(() => {}); },
            routes: [{ path: '*', page: 'custom', config: { mount: (host, ctx) => { ctx.on(window, 'scroll', () => {}); ctx.after(60000, () => {}); host.textContent = 'own page'; } } }],
        });
        const host = createModuleHost(el, {
            modules: [
                { id: 'own', title: 'Own', load: async () => own },
                { id: 'log-settings', title: 'Logging', load: async () => moduleFromMount(mountLogSettings, { id: 'log-settings', title: 'Logging', options: { height: '20rem' } }) },
                { id: 'console', title: 'Console', load: async () => moduleFromMount(mountConsole, { id: 'console', title: 'Console', options: { capture: ['console', 'errors', 'events'], height: '20rem' } }) },
                { id: 'idle', title: 'Idle', load: async () => defineModule({ id: 'idle', routes: [{ path: '*', page: 'custom', config: { mount: () => {} } }] }) },
            ],
            store, ...fast, timeout: 10000,
        });
        const cycle = async () => { for (const id of ['own', 'log-settings', 'console']) { t.eq(await host.show(id), 'ok', id); t.ok(el.querySelector('[data-pk-page]'), `${id} drew its page`); } t.eq(await host.show('idle'), 'ok'); };
        await cycle(); await t.settle(); await wait(100); // one warm-up round: one-time setup (styles, element modules) is not a leak
        const inst = instrument();
        let before, after;
        try {
            before = inst.snapshot();
            performance.clearMeasures();
            for (let i = 0; i < 100; i++) await cycle();
            await t.settle(); await wait(100);
            after = inst.snapshot();
        } finally { inst.restore(); }
        t.eq(JSON.stringify(after.listeners), JSON.stringify(before.listeners), 'window/document listeners are back to the baseline');
        t.eq(after.observers, before.observers, 'live observers are back to the baseline');
        t.eq(after.timers, before.timers, 'timers are back to the baseline');
        t.eq(store.listeners(), 0, 'store subscriptions are freed');
        t.eq(el.querySelectorAll('[data-pk-page]').length, 1, 'only the current page is in the DOM');
        const idle = performance.getEntriesByName('pk-route:idle').map(e => e.duration);
        const ownMs = performance.getEntriesByName('pk-route:own').map(e => e.duration);
        const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
        t.ok(idle.length === 100 && ownMs.length === 100, 'every route change was measured (performance.measure pk-route:<id>)');
        t.ok(mean(idle) <= 100, `switching to an already loaded module takes ${mean(idle).toFixed(1)} ms on average, budget 100`);
        t.ok(mean(ownMs) <= 100, `mounting a loaded module with state and tracked resources takes ${mean(ownMs).toFixed(1)} ms on average, budget 100`);
        await host.destroy();
        t.eq(el.children.length, 0, 'destroy removes the boundary');
    }],

    ['app host: a lazy import that really fails (404) is retried, shows the danger alert with Retry, keeps the previous module, and recovers when Retry finds the chunk', async t => {
        const { createModuleHost, defineModule } = await dist('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        const good = defineModule({ id: 'good', routes: [{ path: '*', page: 'custom', config: { mount: h => { h.textContent = 'good page'; } } }] });
        let attempts = 0;
        const flaky = { id: 'flaky', title: 'Flaky', load: () => { attempts++; return import(new URL('./no-such-chunk-349.js', import.meta.url).href); } };
        const host = createModuleHost(el, { modules: [{ id: 'good', title: 'Good', load: async () => good }, flaky], ...fast });
        t.eq(await host.show('good'), 'ok');
        t.eq(await host.show('flaky'), 'error');
        t.eq(attempts, 2, 'one automatic retry after the backoff');
        const alert = el.querySelector('pk-alert[kind=danger]');
        await t.load(el);
        t.ok(!alert.hidden, 'the error is shown');
        t.eq(alert.heading, 'Could not load Flaky');
        t.eq(alert.shadowRoot.querySelector('[part=title]').textContent, 'Could not load Flaky', 'the upgraded alert renders its heading');
        t.ok(/Something went wrong loading this part of the app\. Try again\./.test(alert.textContent), `a raw import error is not userFacing: the generic text shows, not the fetch detail: ${alert.textContent}`);
        t.ok(el.textContent.includes('good page'), 'the previous module is still on screen');
        t.eq(host.current().id, 'good');
        const retry = alert.querySelector('pk-button[slot=action]');
        t.ok(retry && getComputedStyle(retry).visibility !== 'hidden', 'Retry is a real, defined button');
        flaky.load = async () => defineModule({ id: 'flaky', routes: [{ path: '*', page: 'custom', config: { mount: h => { h.textContent = 'flaky page'; } } }] });
        retry.click();
        await until(() => host.current()?.id === 'flaky' && el.textContent.includes('flaky page'), 'the retry to succeed');
        t.ok(alert.hidden, 'the error is gone');
        await host.destroy();
    }],

    ['app host: a chunk that never answers times out, retries, then shows a clear failure and Retry: never a blank page', async t => {
        const { createModuleHost } = await dist('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        let attempts = 0;
        const host = createModuleHost(el, { modules: [{ id: 'blocked', title: 'Blocked', load: () => { attempts++; return new Promise(() => {}); } }], timeout: 80, retries: 1, backoff: 10 });
        const started = performance.now();
        t.eq(await host.show('blocked'), 'error');
        t.eq(attempts, 2);
        t.ok(performance.now() - started < 1500, 'two 80 ms waits and a backoff, not more');
        await t.load(el);
        t.ok(/no answer after 80 ms/.test(el.querySelector('pk-alert[kind=danger]').textContent), 'the alert says the request timed out');
        t.ok(el.querySelector('pk-skeleton, pk-empty-state'), 'the body shows a placeholder, not nothing');
        t.ok(el.querySelector('pk-alert pk-button'), 'Retry is offered');
        await host.destroy();
    }],

    ['app host: a module whose mount throws, a page that throws and an unmount that throws are contained; other modules and the shell keep working, and each error is logged', async t => {
        const { createModuleHost, defineModule } = await dist('js/app.js');
        const { addLogSink } = await dist('js/log.js');
        const errors = [];
        const stop = addLogSink(e => { if (e.level === 'error') errors.push(`${e.scope}: ${e.message}`); });
        const el = document.createElement('div'); t.stage('').append(el);
        const page = (h, text) => { h.textContent = text; };
        const mods = {
            boom: defineModule({ id: 'boom', mount() { throw new Error('mount exploded'); } }),
            bad: defineModule({ id: 'bad', unmount() { throw new Error('unmount exploded'); }, routes: [{ path: '/', page: 'custom', config: { mount() { throw new Error('page exploded'); } } }, { path: '/ok', page: 'custom', config: { mount: h => page(h, 'bad ok') } }] }),
            fine: defineModule({ id: 'fine', routes: [{ path: '*', page: 'custom', config: { mount: h => page(h, 'fine page') } }] }),
        };
        const host = createModuleHost(el, { modules: Object.entries(mods).map(([id, def]) => ({ id, title: id, load: async () => def })), ...fast });
        try {
            t.eq(await host.show('boom'), 'error');
            await t.load(el);
            t.ok(el.querySelector('pk-alert[kind=danger]').textContent.includes('Something went wrong loading this part of the app. Try again.'), 'a thrown mount error is not userFacing: the generic text shows');
            t.eq(await host.show('bad', { path: '/' }), 'error');
            t.ok(el.querySelector('pk-alert[kind=danger]').textContent.includes('Something went wrong loading this part of the app. Try again.'), 'a thrown page error is not userFacing: the generic text shows');
            t.eq(await host.show('bad', { path: '/ok' }), 'ok', 'the module is still usable after its page failed');
            t.ok(el.textContent.includes('bad ok') && el.querySelector('pk-alert[kind=danger]').hidden);
            t.eq(await host.show('fine'), 'ok', 'a module whose unmount throws can still be left');
            t.ok(el.textContent.includes('fine page'));
        } finally { stop(); }
        for (const re of [/app:boom: mount threw/, /app:bad: the page for \/ failed/, /app:bad: unmount threw/]) t.ok(errors.some(e => re.test(e)), `logged ${re}`);
        await host.destroy();
    }],

    ['app host: nothing depends on element load order: a host built in a document where no pk-* element is defined upgrades correctly when it is adopted into the page', async t => {
        const { createModuleHost, defineModule } = await dist('js/app.js');
        const d = document.implementation.createHTMLDocument('inert'); // no browsing context: nothing here is upgraded
        const c = d.createElement('div'); d.body.append(c);
        const boom = defineModule({ id: 'boom', mount(ctx) { ctx.page.setStatus('the page has a status', { kind: 'warning', heading: 'Heads up' }); throw new Error('starting failed'); } });
        const host = createModuleHost(c, { modules: [{ id: 'boom', title: 'Boom', load: async () => boom }], elements: () => {}, ...fast });
        t.eq(await host.show('boom'), 'error');
        const alert = c.querySelector('pk-alert[kind=danger]'), status = c.querySelectorAll('pk-alert')[1];
        const stage = t.stage('');
        stage.append(document.adoptNode(c));
        await t.load(stage);
        t.eq(alert.kind, 'danger'); t.eq(alert.getAttribute('kind'), 'danger'); t.eq(alert.heading, 'Could not start Boom');
        t.eq(alert.shadowRoot.querySelector('[part=title]').textContent, 'Could not start Boom', 'the attribute set before the upgrade was picked up');
        t.eq(status.getAttribute('kind'), 'warning', 'a property set on the not-yet-upgraded alert reached its attribute (the #325 class of bug)');
        t.eq(status.heading, 'Heads up');
        const retry = alert.querySelector('pk-button');
        t.ok(retry.shadowRoot && retry.part('control'), 'the Retry button upgraded');
        await host.destroy();
    }],

    ['app host: a request made while another mounts cancels the older one in a real browser (signal aborted, listeners removed, older never renders)', async t => {
        const { createModuleHost, defineModule } = await dist('js/app.js');
        const el = document.createElement('div'); t.stage('').append(el);
        let release, ctxA;
        const gate = new Promise(r => { release = r; });
        const a = defineModule({ id: 'a', async mount(ctx) { ctxA = ctx; ctx.on(window, 'resize', () => {}); await gate; }, routes: [{ path: '*', page: 'custom', config: { mount: h => { h.textContent = 'page a'; } } }] });
        const b = defineModule({ id: 'b', routes: [{ path: '*', page: 'custom', config: { mount: h => { h.textContent = 'page b'; } } }] });
        const host = createModuleHost(el, { modules: [{ id: 'a', title: 'A', load: async () => a }, { id: 'b', title: 'B', load: async () => b }], ...fast });
        const inst = instrument();
        try {
            const first = host.show('a');
            await wait(30);
            t.eq(inst.snapshot().listeners.length, 1);
            const second = host.show('b');
            release();
            t.eq(await first, 'superseded'); t.eq(await second, 'ok');
            t.ok(ctxA.signal.aborted); t.eq(inst.snapshot().listeners.length, 0);
            t.ok(el.textContent.includes('page b') && !el.textContent.includes('page a'));
        } finally { inst.restore(); }
        await host.destroy();
    }],

    ['pk-dashboard-page: each tile is its own async boundary - a fast tile and a rejecting tile settle immediately while a slow sibling is still loading, and the slow tile finishing does not touch what the others already drew (#436)', async t => {
        const el = document.createElement('pk-dashboard-page');
        el.config = { tiles: [{ key: 'fast', label: 'Fast' }, { key: 'slow', label: 'Slow' }, { key: 'bad', label: 'Bad' }] };
        const SLOW_MS = 300;
        el.load = async key => {
            if (key === 'slow') { await wait(SLOW_MS); return { value: '2' }; }
            if (key === 'bad') throw new Error('tile boom');
            return { value: '1' };
        };
        const host = t.stage(''); host.append(el);
        await t.load(host);
        await t.settle();
        const tileBox = key => el.shadowRoot.querySelector(`[part="tile"][data-key="${key}"]`);
        const started = performance.now();
        t.ok(tileBox('fast').querySelector('pk-stat'), 'the fast tile rendered without waiting for the slow one');
        t.eq(tileBox('fast').querySelector('pk-stat').value, '1');
        t.ok(tileBox('bad').querySelector('pk-alert'), 'the rejecting tile shows its own error, not a stuck skeleton');
        const elapsed = performance.now() - started;
        t.ok(elapsed < SLOW_MS, `the fast and bad tiles were already settled well before the slow tile's ${SLOW_MS}ms load could finish (checked after ${elapsed.toFixed(0)}ms)`);
        t.ok(tileBox('slow').querySelector('pk-skeleton'), 'the slow tile is still loading');
        await until(() => tileBox('slow').querySelector('pk-stat'), 'the slow tile to resolve');
        t.eq(tileBox('slow').querySelector('pk-stat').value, '2');
        t.eq(tileBox('fast').querySelector('pk-stat').value, '1', 'the fast tile was never touched by the slow tile settling');
        t.ok(tileBox('bad').querySelector('pk-alert'), 'the bad tile was never touched by the slow tile settling');
    }],

    ['workspace page type (#353): mounted and destroyed 100 times leaves no listener, observer, timer or element behind, and every consumer handle is destroyed exactly once', async t => {
        const { mountPage } = await dist('js/app.js');
        const box = document.createElement('div'); t.stage('').append(box);
        let mounts = 0, destroys = 0;
        const config = { panes: ['nav', 'aside'], mount: (panes, ctx) => {
            mounts++; ctx.on(window, 'resize', () => {}); ctx.after(60000, () => {});
            panes.main.textContent = 'main'; panes.nav.textContent = 'nav';
            return { destroy() { destroys++; } };
        } };
        const cycle = async () => {
            const page = await mountPage(box, { type: 'workspace', config });
            const el = box.querySelector('pk-workspace-page');
            await t.load(box);
            await until(() => el.part('main').textContent === 'main' && !el.part('state').firstElementChild, 'the panes to be mounted', 200);
            page.destroy();
            t.eq(box.children.length, 0, 'destroy removes the page');
        };
        await cycle(); await t.settle(); await wait(100);
        const inst = instrument();
        let before, after;
        try {
            before = inst.snapshot();
            for (let i = 0; i < 100; i++) await cycle();
            await t.settle(); await wait(100);
            after = inst.snapshot();
        } finally { inst.restore(); }
        t.eq(JSON.stringify(after.listeners), JSON.stringify(before.listeners), 'window/document listeners are back to the baseline');
        t.eq(after.observers, before.observers, 'live observers are back to the baseline');
        t.eq(after.timers, before.timers, 'timers are back to the baseline');
        t.eq(mounts, 101, 'every cycle mounted'); t.eq(destroys, 101, 'every consumer handle was destroyed exactly once');
    }],

    ['workspace page type (#353): the loading state shows while mount() is pending, a rejection shows the danger alert with a working Retry, and the panes are untouched by the state', async t => {
        const { mountPage } = await dist('js/app.js');
        const box = document.createElement('div'); t.stage('').append(box);
        let attempts = 0, release;
        const page = await mountPage(box, { type: 'workspace', config: { mount: (panes, ctx) => {
            attempts++;
            if (attempts === 1) return new Promise((_, reject) => { release = () => reject(new Error('backend down')); });
            panes.main.textContent = 'recovered';
        } } });
        const el = box.querySelector('pk-workspace-page');
        await t.load(box);
        const state = el.part('state');
        t.ok(state.querySelector('pk-skeleton'), 'loading while mount() is pending');
        t.ok(getComputedStyle(state).display !== 'none', 'the state covers the panes');
        release();
        await until(() => state.querySelector('pk-alert'), 'the error state');
        const alert = state.querySelector('pk-alert');
        t.eq(alert.getAttribute('kind'), 'danger'); t.ok(/backend down/.test(alert.textContent), 'the message says what failed');
        await t.load(state);
        state.querySelector('pk-button').click();
        await until(() => el.part('main').textContent === 'recovered' && !state.firstElementChild, 'Retry to recover');
        t.eq(attempts, 2);
        page.destroy();
    }],

    ['pk-doc-page: the article body and the pk-toc it owns are light DOM the toc can address by id, a same-page link scrolls and emits pk-navigate without touching history, and mounting/unmounting 100 times leaves no listener behind (#353)', async t => {
        const el = document.createElement('pk-doc-page');
        el.config = { items: [{ id: 'a', title: 'Guide A', summary: 'About A' }, { id: 'b', title: 'Guide B' }], id: 'a', search: true };
        el.loadItem = async id => ({ title: `Guide ${id.toUpperCase()}`, summary: 'A summary', html: '<h2 id="one">One</h2><p>text</p><h2 id="two">Two</h2><p><a href="#two">to two</a></p>' });
        el.href = (id, anchor) => `#/${id}${anchor ? `/${anchor}` : ''}`;
        const host = t.stage(''); host.append(el);
        await t.load(host);
        await until(() => el.querySelector('h2#two'), 'the article body to render');
        const toc = el.querySelector('pk-toc');
        await t.load(host);
        await until(() => toc.shadowRoot?.querySelectorAll('a').length === 2, 'the table of contents to list both headings');
        t.eq(el.querySelector('pk-side-nav').querySelectorAll('pk-nav-item').length, 2, 'one nav item per config.items entry');
        t.ok(el.querySelector('pk-nav-item[current]')?.getAttribute('href') === '#/a', 'the current item is marked and linked through href()');
        let detail = null;
        el.addEventListener('pk-navigate', e => { detail = e.detail; });
        const before = location.href;
        el.querySelector('a[href="#two"]').click();
        t.eq(location.href, before, 'the element never touches history itself');
        t.eq(detail?.anchor, 'two', 'pk-navigate reports the heading');
        t.eq(detail?.id, 'a');
        host.replaceChildren();

        const inst = instrument();
        try {
            const baseline = inst.snapshot().listeners.length;
            for (let i = 0; i < 100; i++) {
                const one = document.createElement('pk-doc-page');
                one.config = { items: [{ id: 'a', title: 'A' }] };
                host.append(one);
                await t.load(host);
                one.remove();
            }
            t.eq(inst.snapshot().listeners.length, baseline, 'no document/window listener is left behind after 100 mount/unmount cycles');
        } finally { inst.restore(); }
    }],
];
