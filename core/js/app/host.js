// The module host (#349): runs app modules one at a time inside a container, with a deterministic lifecycle and a boundary around every step that can fail.
// No shell, no router of its own: mountApp (step 4) wires it to the router; it is usable and tested on its own with a fake host element.
//
//   const host = createModuleHost(document.getElementById('app'), {
//       modules: [{ id: 'orders', title: 'Orders', load: () => import('./modules/orders.js') }],   // the ALLOW-LIST: a static literal per module, never built from data
//       router,          // optional mountRouter handle (hash mode): ctx.navigate / ctx.href use it
//       auth, can,       // optional: ctx.auth (opaque to the framework), and (entry, { auth, id, route }) => true | { allow: false, redirect } for the whole app
//       store, settings, // optional: a createStore() (default: one of its own, prefix 'pk'), and the app settings facade given to ctx.settings
//   });
//   const router = mountRouter(el, { mode: 'hash', routes: [...], guard: host.guard });   // access is checked BEFORE anything is imported...
//   await host.open('/orders/7?tab=x');                                                    // ...and again here, at mount, after the import
//
// Lifecycle, once each and in this order: resolve (the allow-listed import, 10 s timeout, one automatic retry after 300 ms, then the boundary error with Retry) ->
// can (app, entry, module; fail closed) -> unmount of the module being left -> mount(ctx) -> per route: layout, page factory (host, config, ctx) -> on a route change
// page cleanup -> on a module switch page cleanup, unmount(ctx), the cleanup mount returned, then everything ctx tracked is disposed. Steps that change what is mounted
// run one at a time in request order; a request made while another is in flight cancels the older one (its ctx.signal aborts, what it mounted is torn down before
// the newer one starts). A failed import, timeout or denied module leaves the previous module mounted and usable; a throwing mount or page shows the boundary error
// and Retry, and a module can always be left. Every failure is logged through the SDK logger (scope app:<id>).
//
// The module id in an address is only a key into the allow-list (ids are checked against MODULE_ID first); nothing else is ever passed to import().
// show(id, { path, query }) / open(address, query) resolve to 'ok' | 'forbidden' | 'not-found' | 'error' | 'superseded'.
//
// ctx (what a module and its pages receive) is documented in js/app/module.js.
import { createLogger, isLogEnabled } from '../log.js';
import { createPage, BUSY_DELAY } from '../page.js';
import { createStore } from '../store.js';
import { matchRoute } from '../route-tree.js';
import { loadElements } from '../loader.js';
import { setTheme, currentTheme, toggleTheme } from '../theme.js';
import { MODULE_ID, defineModule, pageTypeFor, layoutFor } from './module.js';
import { createBoundary, loadWithRetry } from './boundary.js';

const log = createLogger('app');
const norm = p => '/' + String(p ?? '').split(/[?#]/)[0].split('/').filter(Boolean).join('/');
const join = (id, p) => `/${id}${norm(p) === '/' ? '' : norm(p)}`;
const cleanupOf = out => (typeof out === 'function' ? out : out?.destroy ? () => out.destroy() : null);
const safe = async (fn, what, lg) => { try { await fn?.(); } catch (e) { lg.error(`${what} threw`, e); } };

export function createModuleHost(container, { modules = [], router, auth, can, store, settings, timeout = 10000, retries = 1, backoff = 300, elements = loadElements } = {}) {
    const allow = new Map();
    for (const m of modules) {
        if (!m || typeof m.id !== 'string' || !MODULE_ID.test(m.id) || typeof m.load !== 'function' || allow.has(m.id)) throw new TypeError(`createModuleHost: bad, missing or duplicate module entry ${JSON.stringify(m?.id)}`);
        allow.set(m.id, m);
    }
    const doc = container.ownerDocument;
    const root = doc.documentElement;
    // No element is defined when it is created: whatever the host or a page adds is loaded after it is in the page (a pk-* tag renders hidden until defined).
    const load = () => Promise.resolve(elements(box.root)).catch(e => log.error('could not load the elements of the app', e));
    const box = createBoundary(doc, load);
    container.replaceChildren(box.root);
    load();
    // While the next module loads the previous one is covered (after BUSY_DELAY, so a fast load never flashes it).
    const hostPage = createPage({ overlay: box.busy, delay: BUSY_DELAY, scope: 'app' });

    let st = store, token = 0, active = null, last = null, dead = false, turn = Promise.resolve();
    const timers = new Map(), defs = new Map();
    const alive = t => !dead && t === token;
    const getStore = () => (st ??= createStore());
    // Steps that change what is mounted run one at a time, in request order.
    const exclusive = fn => { const p = turn.then(fn); turn = p.catch(e => log.error('a module step failed unexpectedly', e)); return p; };
    const wait = ms => new Promise(resolve => { const id = setTimeout(() => { timers.delete(id); resolve(); }, ms); timers.set(id, resolve); });
    const within = (promise, ms) => {
        let id;
        const timeoutP = new Promise((_, reject) => { id = setTimeout(() => reject(new Error(`no answer after ${ms} ms`)), ms); timers.set(id, () => {}); });
        return Promise.race([promise, timeoutP]).finally(() => { clearTimeout(id); timers.delete(id); });
    };

    // true, or { allow: false, redirect }: the checks run in order and the first answer that is not true (or { allow: true }) wins; a throw denies.
    const verdict = (id, route, ...checks) => {
        for (const check of checks) {
            if (!check) continue;
            try {
                const r = check({ auth, id, route });
                if (!(r === true || r?.allow === true)) return { allow: false, redirect: r?.allow === false ? r.redirect ?? null : null };
            } catch (e) {
                log.error(`a can() check threw for "${id}", access is denied`, e);
                return { allow: false, redirect: null };
            }
        }
        return true;
    };
    const access = (entry, def, route) => verdict(entry.id, route, can && (c => can(entry, c)), entry.can, def?.can);

    // A scope of tracked resources: what on/observe/after/signal register ends with end(); late calls do nothing.
    function scope(lg) {
        const ac = new AbortController(), off = new Set();
        const own = fn => (off.add(fn), fn);
        const live = what => !ac.signal.aborted || (lg.warn(`${what}() after the end of its scope ignored`), false);
        const api = {
            signal: ac.signal,
            on(target, type, fn, o) {
                if (!live('on')) return () => {};
                target.addEventListener(type, fn, o);
                return own(() => target.removeEventListener(type, fn, o));
            },
            observe(observer, target, o) {
                if (live('observe')) { observer.observe(target, o); own(() => observer.disconnect()); }
                return observer;
            },
            after(ms, fn) {
                if (!live('after')) return () => {};
                const stop = own(() => clearTimeout(t));
                const t = setTimeout(() => { off.delete(stop); safe(fn, 'after() callback', lg); }, ms);
                return stop;
            },
            theme: {
                get name() { return currentTheme(root); },
                set: n => setTheme(root, n),
                toggle: () => toggleTheme(root),
                subscribe(fn) {
                    const mo = api.observe(new (doc.defaultView?.MutationObserver ?? MutationObserver)(() => fn(currentTheme(root))), root, { attributes: true, attributeFilter: ['data-theme'] });
                    return () => mo.disconnect();
                },
            },
        };
        const end = async () => {
            ac.abort();
            for (const fn of [...off].reverse()) await safe(fn, 'cleanup', lg);
            off.clear();
        };
        return { api: Object.getOwnPropertyDescriptors(api), end };
    }

    function makeCtx(entry, def, s) {
        const id = entry.id, lg = createLogger(`app:${id}`);
        const facade = def.state ? getStore().module(id, def.state) : null;
        const page = createPage({ alert: box.status, body: box.body, scope: `app:${id}` });
        const base = {
            id, auth, log: lg, page, store: facade, settings: settings ?? null,
            get route() { return s.route; },
            navigate: (p, o) => (router ? router.navigate(join(id, p), o) : (lg.warn('navigate: no router was given to the host'), false)),
            href: (p, params, query) => (router ? router.href(join(id, p), params, query) : null),
        };
        const mine = scope(lg);
        return {
            ctx: Object.create(base, mine.api), lg,
            // A ctx for one page: the same members, with resources that end when the page is left.
            pageScope() { const p = scope(lg); return { ctx: Object.create(base, p.api), end: p.end }; },
            // Ends everything the module registered, last first; nothing here can throw.
            async dispose() {
                await mine.end();
                facade?.destroy();
                page.destroy();
                page.clearStatus();
            },
        };
    }

    const dropPage = async a => {
        const { page, end } = a.page ?? {};
        a.page = null;
        await safe(page, 'page cleanup', a.lg);
        await safe(end, 'page cleanup', a.lg);
        a.pageHost?.remove();
        a.pageHost = null;
    };
    async function leave() {
        const a = active;
        if (!a) return;
        active = null;
        await dropPage(a);
        await safe(() => a.def.unmount?.(a.ctx), 'unmount', a.lg);
        await safe(a.cleanup, 'mount cleanup', a.lg);
        await a.dispose();
    }

    async function showPage(a, r, t) {
        await dropPage(a);
        if (!alive(t) || a !== active) return 'superseded';
        const route = a.state.route = { path: norm(r.path), params: {}, query: { ...r.query } };
        const m = matchRoute(a.def.routes ?? [], r.path);
        if (m) route.params = { ...m.params };
        const spec = m && (typeof m.node.page === 'string' ? { type: m.node.page, config: m.node.config } : { config: m.node.config, ...m.node.page });
        if (!spec || spec.type === 'not-found') { box.notFound(`There is nothing at ${a.entry.title} ${route.path}.`); return 'not-found'; }
        if (verdict(a.entry.id, route, m.node.can) !== true) { box.forbidden(a.entry.title); return 'forbidden'; }
        const factory = pageTypeFor(a.def, spec.type), layout = m.node.layout && layoutFor(a.def, m.node.layout);
        const host = doc.createElement('div'), sc = a.pageScope();
        host.setAttribute('data-pk-page', spec.type);
        a.pageHost = host;
        try {
            if (!factory || (m.node.layout && !layout)) throw new Error(!factory ? `the page type "${spec.type}" is not available` : `the layout "${m.node.layout}" is not available`);
            box.ready();
            box.body.replaceChildren(host);
            const into = (layout && (await layout(host, sc.ctx))) || host;
            const cfg = typeof spec.config === 'function' ? spec.config(route, sc.ctx) : spec.config;
            const cleanup = cleanupOf(await factory(into, cfg, sc.ctx));
            load();
            if (!alive(t) || a !== active) { await safe(cleanup, 'page cleanup', a.lg); await sc.end(); host.remove(); return 'superseded'; }
            a.page = { page: cleanup, end: sc.end };
            return 'ok';
        } catch (e) {
            a.lg.error(`the page for ${route.path} failed`, e);
            await sc.end();
            host.remove();
            a.pageHost = null;
            if (alive(t) && a === active) box.fail(`Could not show ${a.entry.title}`, e, () => show(a.entry.id, r));
            return 'error';
        }
    }

    // What to do once the module is known and loaded, run exclusively: check access, then show the page (same module) or switch modules.
    async function apply(entry, def, r, t) {
        if (!alive(t)) return 'superseded';
        if (!def || access(entry, def, r) !== true) { await leave(); if (!alive(t)) return 'superseded'; box.forbidden(entry.title); return 'forbidden'; }
        if (active?.entry === entry) return showPage(active, r, t);
        await leave();
        if (!alive(t)) return 'superseded';
        const s = { route: { path: '/', params: {}, query: {} } };
        const { ctx, dispose, lg, pageScope } = makeCtx(entry, def, s);
        const a = { entry, def, ctx, dispose, lg, pageScope, state: s, page: null, pageHost: null, cleanup: null };
        try {
            a.cleanup = cleanupOf(await def.mount?.(ctx));
        } catch (e) {
            lg.error('mount threw', e);
            await dispose();
            if (alive(t)) box.fail(`Could not start ${entry.title}`, e, () => show(entry.id, r));
            return alive(t) ? 'error' : 'superseded';
        }
        if (!alive(t)) { await safe(() => def.unmount?.(ctx), 'unmount', lg); await safe(a.cleanup, 'mount cleanup', lg); await dispose(); return 'superseded'; }
        active = a;
        return showPage(a, r, t);
    }

    async function run(id, r, t) {
        const entry = typeof id === 'string' && MODULE_ID.test(id) ? allow.get(id) : undefined;
        if (!entry) return exclusive(async () => { if (!alive(t)) return 'superseded'; await leave(); box.notFound('There is no such page.'); return 'not-found'; });
        let def = defs.get(id);
        if (!def && access(entry, null, r) === true) {
            // Only an allow-listed loader is ever called, and only for a module that is not denied at the door.
            box.loading(entry.title, !active);
            const end = active ? hostPage.begin(`Loading ${entry.title}`) : null;
            try {
                const mod = await loadWithRetry(entry.load, { retries, backoff, timeout, wait, within, alive: () => alive(t), log });
                def = defineModule(mod?.default ?? mod);
                if (def.id !== id) throw new Error(`the module loaded for "${id}" says its id is "${def.id}"`);
                defs.set(id, def);
            } catch (e) {
                if (!alive(t)) return 'superseded';
                log.error(`could not load the module "${id}"`, e);
                box.fail(`Could not load ${entry.title}`, e, () => show(id, r));
                return 'error';
            } finally {
                end?.();
            }
        }
        return exclusive(() => apply(entry, def, r, t));
    }

    async function show(id, route = {}) {
        if (dead) return 'superseded';
        const t = ++token, r = { path: '/', query: {}, ...route };
        last = [id, r];
        const t0 = globalThis.performance?.now() ?? 0;
        const status = await run(id, r, t);
        if (alive(t)) {
            globalThis.performance?.measure?.(`pk-route:${allow.has(id) ? id : '?'}`, { start: t0 });
            if (isLogEnabled('debug', 'app')) log.debug(`${id}${norm(r.path)}: ${status} in ${Math.round((globalThis.performance?.now() ?? 0) - t0)} ms`);
        }
        return status;
    }

    return {
        show,
        // An address '/<module>/<path>' (what a hash-mode router reports as its `url`) with its query object: the first segment is the module id.
        open(address, query = {}) {
            const [id, ...rest] = norm(address).split('/').filter(Boolean);
            return show(id, { path: '/' + rest.join('/'), query });
        },
        // Give this to mountRouter({ guard }): the same checks as at mount, before anything is imported. Unknown modules pass (the router shows its not-found).
        guard(route) {
            const entry = allow.get(norm(route.path).split('/')[1]);
            return entry ? access(entry, null, route) : true;
        },
        // Run the last request again (the Retry button does).
        retry: () => (last ? show(...last) : Promise.resolve('superseded')),
        current: () => (active ? { id: active.entry.id, def: active.def, ctx: active.ctx, route: active.state.route } : null),
        async destroy() {
            dead = true;
            token++;
            for (const [id, resolve] of timers) { clearTimeout(id); resolve(); }
            timers.clear();
            await exclusive(leave);
            hostPage.destroy();
            box.dispose();
            if (!store) st?.destroy();
        },
    };
}
