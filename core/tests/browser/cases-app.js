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

    ['pk-dashboard-page: each widget is its own pk-card async boundary - a fast widget and a rejecting widget settle immediately while a slow sibling is still loading, and the slow one finishing does not touch what the others already drew (#436, #489)', async t => {
        const el = document.createElement('pk-dashboard-page');
        el.config = { widgets: [{ key: 'fast', label: 'Fast' }, { key: 'slow', label: 'Slow' }, { key: 'bad', label: 'Bad' }] };
        const SLOW_MS = 300;
        el.load = async key => {
            if (key === 'slow') { await wait(SLOW_MS); return { value: '2' }; }
            if (key === 'bad') throw new Error('widget boom');
            return { value: '1' };
        };
        const host = t.stage(''); host.append(el);
        await t.load(host);
        await t.settle();
        const card = key => el.shadowRoot.querySelector(`pk-card[data-key="${key}"]`);
        const started = performance.now();
        t.ok(card('fast').querySelector('pk-stat'), 'the fast widget rendered without waiting for the slow one');
        t.eq(card('fast').querySelector('pk-stat').value, '1');
        t.eq(card('bad').dataset.state, 'error', 'the rejecting widget shows its own error, not a stuck skeleton');
        t.ok(card('bad').querySelector('pk-alert'), 'the error is drawn into the card body by the page');
        const elapsed = performance.now() - started;
        t.ok(elapsed < SLOW_MS, `the fast and bad widgets were already settled well before the slow one's ${SLOW_MS}ms load could finish (checked after ${elapsed.toFixed(0)}ms)`);
        t.eq(card('slow').dataset.state, 'loading', 'the slow widget is still loading');
        await until(() => card('slow').querySelector('pk-stat'), 'the slow widget to resolve');
        t.eq(card('slow').querySelector('pk-stat').value, '2');
        t.eq(card('fast').querySelector('pk-stat').value, '1', 'the fast widget was never touched by the slow one settling');
        t.eq(card('bad').dataset.state, 'error', 'the bad widget was never touched by the slow one settling');
    }],

    ['pk-dashboard-page tabs (#489): a tab that was never opened never calls load(), opening it loads its widgets once, a revisit reloads nothing, and a filter change reloads only widgets that already loaded', async t => {
        const el = document.createElement('pk-dashboard-page');
        el.config = {
            tabs: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }],
            widgets: [{ key: 'a', tab: 'one', label: 'A' }, { key: 'b', tab: 'two', label: 'B' }],
            filters: [{ key: 'range', type: 'select', label: 'Range', options: ['7d', '30d'] }],
        };
        const calls = [];
        el.load = async function (key) { calls.push(key + ':' + (this.context.range ?? '')); return { value: '1' }; };
        const host = t.stage(''); host.append(el);
        await t.load(host);
        await t.settle();
        t.eq(calls.join(), 'a:', 'only the initial tab loaded');
        const strip = el.shadowRoot.querySelector('pk-tabs');
        const tab = v => [...strip.querySelectorAll('pk-tab')].find(x => x.value === v);
        tab('two').click();
        await until(() => calls.includes('b:'), 'the second tab to load');
        tab('one').click(); await t.settle(); tab('two').click(); await t.settle();
        t.eq(calls.join(), 'a:,b:', 'a revisit reloads nothing');
        const select = el.shadowRoot.querySelector('[part="filters"] pk-select');
        select.value = '30d';
        select.dispatchEvent(new CustomEvent('pk-value-change', { bubbles: true, composed: true, detail: { value: '30d' } }));
        await until(() => calls.length === 4, 'both loaded widgets to reload');
        t.eq(el.context.range, '30d');
        t.eq(calls.slice(2).sort().join(), 'a:30d,b:30d');
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

    ['record page type (#353): mounted and destroyed 100 times leaves no listener (the leave guard included), observer, timer or element behind', async t => {
        const { mountPage } = await dist('js/app.js');
        const box = document.createElement('div'); t.stage('').append(box);
        const config = { fields: [{ name: 'name', label: 'Name', required: true }], sidebar: [{ heading: 'Summary', fields: ['name'] }], load: async () => ({ name: 'Widget' }), save: async () => {}, mode: 'edit' };
        const cycle = async () => {
            const page = await mountPage(box, { type: 'record', config: { ...config, id: '1' } });
            const el = box.querySelector('pk-record-page');
            await t.load(box);
            await until(() => el.part('main').querySelector('pk-form') && !el.part('state').firstElementChild, 'the record to render', 200);
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
    }],

    ['record page type (#353): loading while load() is pending, a rejection shows the danger alert with a working Retry, edit shows the form and a server error lands on its field', async t => {
        const { mountPage } = await dist('js/app.js');
        const box = document.createElement('div'); t.stage('').append(box);
        let attempts = 0, release;
        const page = await mountPage(box, { type: 'record', config: { id: '1', fields: [{ name: 'name', label: 'Name', required: true }], load: () => {
            if (++attempts === 1) return new Promise((_, reject) => { release = () => reject(new Error('backend down')); });
            return { name: 'Widget' };
        }, save: async () => { throw Object.assign(new Error('invalid'), { errors: { name: 'Name is taken' } }); } } });
        const el = box.querySelector('pk-record-page');
        await t.load(box);
        const state = el.part('state');
        t.ok(state.querySelector('pk-skeleton'), 'loading while load() is pending');
        release();
        await until(() => state.querySelector('pk-alert'), 'the error state');
        t.eq(state.querySelector('pk-alert').getAttribute('kind'), 'danger'); t.ok(/backend down/.test(state.querySelector('pk-alert').textContent));
        await t.load(state);
        state.querySelector('pk-button').click();
        await until(() => el.part('main').querySelector('pk-field-list') && !state.firstElementChild, 'Retry to recover');
        t.eq(attempts, 2);
        el.part('edit').click();
        await until(() => el.part('main').querySelector('pk-form'), 'edit mode');
        await t.load(el.part('main'));
        const ctl = el.part('main').querySelector('[name=name]');
        ctl.value = 'Taken'; ctl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        t.eq(el.dirty, true, 'an edit marks the page dirty');
        el.part('save').click();
        await until(() => el.part('main').querySelector('pk-field').getAttribute('error') === 'Name is taken', 'the inline server error');
        t.eq(el.dirty, true, 'a failed save stays dirty');
        page.destroy();
    }],

    ['wizard page type (#353): mounted and destroyed 100 times leaves no listener (the leave guard included), observer, timer or element behind', async t => {
        const { mountPage } = await dist('js/app.js');
        const box = document.createElement('div'); t.stage('').append(box);
        const config = { review: true, steps: [{ id: 'a', label: 'One', fields: [{ name: 'name', label: 'Name', required: true }] }], validate: async () => {}, submit: async () => {} };
        const cycle = async () => {
            const page = await mountPage(box, { type: 'wizard', config });
            const el = box.querySelector('pk-wizard-page');
            await t.load(box);
            await until(() => el.part('panes').querySelector('pk-form'), 'the first step to render', 200);
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
    }],

    ['wizard page type (#353): load pending shows loading, a rejection shows an alert with a working Retry, an invalid step blocks Next, valid answers go on, Back keeps them, and a submit error returns to its field', async t => {
        const { mountPage } = await dist('js/app.js');
        const box = document.createElement('div'); t.stage('').append(box);
        let attempts = 0, release;
        const page = await mountPage(box, { type: 'wizard', config: {
            review: true,
            steps: [{ id: 'a', label: 'Account', fields: [{ name: 'email', label: 'Email', required: true }] }, { id: 'b', label: 'Plan', fields: [{ name: 'plan', label: 'Plan' }] }],
            load: () => { if (++attempts === 1) return new Promise((_, reject) => { release = () => reject(new Error('backend down')); }); return {}; },
            submit: async () => { throw Object.assign(new Error('invalid'), { errors: { email: 'Taken' } }); },
        } });
        const el = box.querySelector('pk-wizard-page');
        await t.load(box);
        const state = el.part('state');
        t.ok(state.querySelector('pk-skeleton'), 'loading while load() is pending');
        release();
        await until(() => state.querySelector('pk-alert'), 'the error state');
        t.ok(/backend down/.test(state.querySelector('pk-alert').textContent));
        await t.load(state);
        state.querySelector('pk-button').click();
        await until(() => el.part('panes').querySelector('pk-form') && !state.firstElementChild, 'Retry to recover');
        t.eq(attempts, 2);
        await t.load(el.part('panes'));
        el.part('next').click();
        await wait(200);
        t.eq(el.part('heading').textContent, 'Account', 'an empty required field blocks Next');
        const email = el.part('panes').querySelector('[name=email]');
        const inner = email.part('control'); inner.value = 'a@b.c'; inner.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        t.eq(el.dirty, true, 'typing marks the wizard dirty');
        await t.settle(); // the control's validity follows its value on the next update
        el.part('next').click();
        await until(() => el.part('heading').textContent === 'Plan', 'step two');
        el.part('back').click();
        await until(() => el.part('heading').textContent === 'Account', 'back to step one');
        t.eq(el.part('panes').querySelector('[name=email]').value, 'a@b.c', 'the answer is kept going back');
        el.part('next').click(); await until(() => el.part('heading').textContent === 'Plan', 'step two again');
        el.part('next').click(); await until(() => el.part('heading').textContent === 'Review', 'the review step');
        el.part('next').click();
        await until(() => el.part('heading').textContent === 'Account' && el.part('panes').querySelector('pk-field[error]'), 'the submit error on its field');
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

    ['master-detail page type (#353): mounted and destroyed 100 times, opening and closing a record each time, leaves no listener, observer, timer or element behind, and every record handle is destroyed exactly once', async t => {
        const { mountPage } = await dist('js/app.js');
        const box = document.createElement('div'); t.stage('').append(box);
        let mounts = 0, destroys = 0;
        const config = { list: { columns: [{ key: 'name', label: 'Name' }] }, load: () => ({ rows: [{ id: '1', name: 'A' }] }), mountDetail: (pane, id, ctx) => {
            mounts++; ctx.on(window, 'resize', () => {}); ctx.after(60000, () => {});
            pane.textContent = 'record ' + id;
            return { destroy() { destroys++; } };
        } };
        const cycle = async () => {
            const page = await mountPage(box, { type: 'master-detail', config });
            const el = box.querySelector('pk-master-detail-page');
            await t.load(box);
            el.recordId = '1';
            await until(() => el.part('record').textContent === 'record 1' && !el.part('state').firstElementChild, 'the record to be mounted', 200);
            el.recordId = '';
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
        t.eq(mounts, 101, 'every cycle mounted'); t.eq(destroys, 101, 'every record handle was destroyed exactly once');
    }],

    ['master-detail page type (#353): a failing list shows its error state, a pending record shows loading, a rejected record shows the danger alert and Retry recovers it', async t => {
        const { mountPage } = await dist('js/app.js');
        const box = document.createElement('div'); t.stage('').append(box);
        let attempts = 0, release;
        const page = await mountPage(box, { type: 'master-detail', config: { list: { columns: [{ key: 'name', label: 'Name' }] }, load: () => { throw new Error('list down'); }, mountDetail: (pane, id) => {
            attempts++;
            if (attempts === 1) return new Promise((_, reject) => { release = () => reject(new Error('record down')); });
            pane.textContent = 'recovered ' + id;
        } } });
        const el = box.querySelector('pk-master-detail-page');
        await t.load(box);
        const listState = () => el.part('list').part('state');
        await until(() => listState().querySelector('pk-alert'), 'the list error state');
        t.ok(/list down/.test(listState().textContent), 'the list error names what failed');
        el.recordId = '9';
        const state = el.part('state');
        await until(() => state.querySelector('pk-skeleton'), 'the record loading state');
        release();
        await until(() => state.querySelector('pk-alert'), 'the record error state');
        t.eq(state.querySelector('pk-alert').getAttribute('kind'), 'danger'); t.ok(/record down/.test(state.textContent));
        await t.load(state);
        state.querySelector('pk-button').click();
        await until(() => el.part('record').textContent === 'recovered 9' && !state.firstElementChild, 'Retry to recover');
        t.eq(attempts, 2);
        page.destroy();
    }],

    ['doc page type (#353): mounted and destroyed 100 times, each time showing an item, leaves no listener, observer, timer or element behind', async t => {
        const { mountPage } = await dist('js/app.js');
        const box = document.createElement('div'); t.stage('').append(box);
        const config = { items: [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }], id: 'a', search: true, loadItem: id => ({ title: 'Doc ' + id, summary: 's', html: '<h2 id="x">Head</h2><p>text</p>' }), href: (id, anchor) => '/docs/' + id + (anchor ? '?anchor=' + anchor : '') };
        const cycle = async () => {
            const page = await mountPage(box, { type: 'doc', config });
            const el = box.querySelector('pk-doc-page');
            await t.load(box);
            await until(() => /Doc a/.test(el.textContent) && !el.querySelector('pk-skeleton'), 'the item to render', 200);
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
    }],

    ['doc page type (#353): loading while loadItem() is pending, a rejection shows the danger alert with a working Retry, an unknown item shows not found', async t => {
        const { mountPage } = await dist('js/app.js');
        const box = document.createElement('div'); t.stage('').append(box);
        let attempts = 0, release;
        const page = await mountPage(box, { type: 'doc', config: { items: [{ id: 'a', title: 'Alpha' }], id: 'a', loadItem: id => {
            if (id === 'gone') return null;
            if (++attempts === 1) return new Promise((_, reject) => { release = () => reject(new Error('docs down')); });
            return { title: 'Recovered', html: '<p>ok</p>' };
        } } });
        const el = box.querySelector('pk-doc-page');
        await t.load(box);
        const body = () => el.querySelector('.prose');
        await until(() => body().querySelector('pk-skeleton'), 'the loading state');
        release();
        await until(() => body().querySelector('pk-alert'), 'the error state');
        t.eq(body().querySelector('pk-alert').getAttribute('kind'), 'danger'); t.ok(/docs down/.test(body().textContent));
        await t.load(body());
        body().querySelector('pk-button').click();
        await until(() => /ok/.test(body().textContent) && !body().querySelector('pk-alert'), 'Retry to recover');
        t.eq(attempts, 2);
        el.config = { ...el.config, id: 'gone' };
        await until(() => /Not found/.test(el.querySelector('.doc-page-title').textContent) && body().querySelector('pk-empty-state')?.getAttribute('heading') === 'Not found', 'the not-found state');
        page.destroy();
    }],

    ['pk-link + mountRouter intercept (#522): a plain click on `to` is handled by the router (no history entry beyond the one pushed, no full navigation), a modified click is left to the browser, and destroy() removes the listener', async t => {
        const { mountRouter } = await dist('js/router.js');
        const host = t.stage('<pk-link>Order 7</pk-link><pk-link>Reports</pk-link>');
        await t.load(host);
        const [routedEl, plainEl] = host.querySelectorAll('pk-link');
        routedEl.to = '/orders/7'; // set as properties, not inline attributes: the carveout test bans a root-absolute href in a static source file
        plainEl.href = '/reports';
        await t.settle();
        const before = location.pathname;
        const router = mountRouter(host, { routes: [{ path: '/', label: 'Home', children: [{ path: '/orders/:id', label: p => `Order ${p.id}` }] }], intercept: true, base: '/__pk-link-test' });
        const routed = routedEl, plain = plainEl;
        let seen = null;
        routed.addEventListener('pk-navigate', e => { seen = e.detail; }, { once: true });
        routed.shadowRoot.querySelector('a').click();
        t.eq(seen?.to, '/orders/7', 'pk-link reports the pk-navigate detail before the router cancels it');
        t.eq(router.current()?.label, 'Order 7', 'the router picked up the route: history.pushState ran, not a full navigation (the test script kept executing)');
        t.eq(location.pathname, `/__pk-link-test/orders/7`, 'pushState moved the address bar under the router base, as a client route does');
        history.replaceState(null, '', before); // leave the address where the run started; router.destroy() below does not touch history itself
        // an ordinary href link is untouched: it keeps a real anchor with no interception wiring of its own.
        t.eq(plain.shadowRoot.querySelector('a').getAttribute('href'), '/reports');
        // destroy() removes the container's pk-navigate listener too: a further pk-navigate is left uncancelled (pk-link falls back to a
        // real navigation from here, node-tested in router.test.mjs; not fired here to avoid actually navigating this test page away).
        router.destroy();
        let afterDestroy = 'not called';
        const stillCancels = e => { afterDestroy = e.defaultPrevented; e.preventDefault(); };
        host.addEventListener('pk-navigate', stillCancels);
        routed.dispatchEvent(new CustomEvent('pk-navigate', { detail: { to: '/orders/7' }, bubbles: true, composed: true, cancelable: true }));
        host.removeEventListener('pk-navigate', stillCancels);
        t.eq(afterDestroy, false, 'the event reaches the host uncancelled: the router stopped listening once destroyed');
        host.replaceChildren();
    }],
    // #807: app.js focuses `h1,pk-heading[level="1"]` under main after a route change, so every built-in page type must hand it exactly one, through mountTitled.
    ['built-in page types states, not-found, doc and tool (#807): each gives post-navigation focus exactly one light-DOM h1 or level 1 pk-heading, focusable, and no second level 1 heading', async t => {
        const { mountPage } = await dist('js/app.js');
        const cases = [
            ['states', { state: 'empty', heading: 'No orders', description: 'Nothing yet' }, 'No orders'],
            ['states', { state: 'error', description: 'It broke' }, 'Something went wrong'],
            ['not-found', {}, 'Page not found'],
            ['not-found', { heading: 'Gone' }, 'Gone'],
            ['tool', { heading: 'Word count', input: [{ key: 'text', label: 'Text', type: 'text' }] }, 'Word count'],
            ['doc', { items: [{ id: 'a', title: 'Alpha', summary: 'First' }], id: 'a', loadItem: async () => ({ title: 'Alpha', summary: 'First', html: '<p>x</p>' }), href: id => `/${id}` }, null],
        ];
        for (const [type, config, text] of cases) {
            const box = document.createElement('main'); t.stage('').append(box);
            const page = await mountPage(box, { type, config });
            await t.load(box);
            await wait(100);
            const found = box.querySelectorAll('h1,pk-heading[level="1"]');
            t.eq(found.length, 1, `${type} ${JSON.stringify(config).slice(0, 30)}: exactly one h1`);
            const h = found[0];
            if (text) t.eq(h.textContent.trim(), text, `${type}: the heading text`);
            h.tabIndex = -1; h.focus({ preventScroll: true });
            t.eq(document.activeElement, h, `${type}: focus lands on the heading`);
            t.eq(box.querySelectorAll('[role="heading"][aria-level="1"]').length, 0, `${type}: no second level 1 heading in the light DOM`);
            page.destroy();
        }
    }],
    // #897: a confirm answered the moment it opens must settle (resolve, element removed) and never block the next ask.
    ['dialogs (#897): a confirm answered immediately on open settles and the next one opens, 40 times', async t => {
        const { createDialogs } = await dist('js/dialogs.js');
        const box = t.stage(''), dialogs = createDialogs({ container: box, load: el => t.load(el) });
        for (let i = 0; i < 40; i++) {
            const p = dialogs.confirm({ heading: `Leave ${i}?`, message: 'x', confirmLabel: 'Leave', cancelLabel: 'Stay', danger: true });
            const dlg = await until(() => box.querySelector('pk-dialog'), `dialog ${i} to open`);
            const stay = [...dlg.querySelectorAll('pk-button')].find(b => b.textContent === 'Stay');
            stay.click();
            t.eq(await Promise.race([p, wait(2000).then(() => 'stuck')]), false, `dialog ${i} resolves false at once`);
            t.eq(box.querySelectorAll('pk-dialog').length, 0, `dialog ${i} is removed`);
        }
        dialogs.destroy();
    }],
];
