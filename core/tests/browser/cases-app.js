// Browser cases for the app module host (js/app/*.js, #349): what needs real elements, real dynamic imports and real observers. Same contract as cases.js:
// [name, async (t) => void]. The node test (tests/app-module.test.mjs) proves the logic against a DOM double; these prove it in a browser, with the tool modules from dist.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, tries = 100) => { for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; await wait(30); } throw new Error(`timed out waiting for ${what}`); };
const dist = path => import(new URL(`../../dist/${path}`, import.meta.url).href);
const fast = { timeout: 300, backoff: 20 };

// Counts what a module could leak: listeners on window, document, <html> and <body>; live observers (mutation, resize, intersection, performance) that watch something still in the page
// (an element's observer of its own removed subtree is freed with the element, not counted); intervals and long timers.
function instrument() {
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
        t.ok(/dynamically imported module|Failed to fetch|error loading/i.test(alert.textContent), `the message says what failed: ${alert.textContent}`);
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
            t.ok(el.querySelector('pk-alert[kind=danger]').textContent.includes('mount exploded'));
            t.eq(await host.show('bad', { path: '/' }), 'error');
            t.ok(el.querySelector('pk-alert[kind=danger]').textContent.includes('page exploded'));
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
];
