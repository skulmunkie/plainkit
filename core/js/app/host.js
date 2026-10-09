// The module host (#349): runs app modules one at a time inside a container, with a deterministic lifecycle and a boundary around every step that can fail.
// No shell, no router of its own: mountApp (step 4) wires it to the router; it is usable and tested on its own with a fake host element.
//
//   const host = createModuleHost(document.getElementById('app'), {
//       modules: [{ id: 'orders', title: 'Orders', load: () => import('./modules/orders.js') }],   // the ALLOW-LIST: a static literal per module, never built from data
//       router,          // optional mountRouter handle (hash mode): ctx.navigate / ctx.href use it
//       auth, can,       // optional: ctx.auth (opaque to the framework), and (entry, { auth, id, route }) => true | { allow: false, redirect } for the whole app
//       store, settings, // optional: a createStore() (default: one of its own, prefix 'pk'), and the app settings facade given to ctx.settings
//       services,        // optional: more members for every ctx (mountApp adds ctx.search); core's own members win over a service of the same name
//       tasks,           // optional: the app's task manager, createTasks({ container, ... }) from js/tasks.js (the shell makes it); ctx.tasks.run(spec) then runs a task of the module (or page)
//       notify, dialogs, // optional: js/notify.js, js/dialogs.js; else ctx.notify, ctx.dialogs are null
//   });
//   const router = mountRouter(el, { mode: 'hash', routes: [...], guard: host.guard });   // access is checked BEFORE anything is imported...
//   await host.open('/orders/7?tab=x');                                                    // ...and again here, at mount, after the import
//
// Lifecycle, once each and in this order: resolve (the allow-listed import, 10 s timeout, one retry after 300 ms, then the boundary error with Retry) ->
// can (app, entry, module; fail closed) -> unmount of the module being left -> mount(ctx) -> per route: layout, page factory (host, config, ctx) -> on a route change
// page cleanup -> on a module switch page cleanup, unmount(ctx), the cleanup mount returned, then everything ctx tracked is disposed. Steps that change what is mounted
// run one at a time in request order; a newer request cancels an older one in flight (its ctx.signal aborts, what it mounted is torn down first). A failed import, timeout or denied module leaves the previous module mounted and usable; a throwing mount or page shows the boundary error
// and Retry, and a module can always be left. Every failure is logged through the SDK logger (scope app:<id>).
//
// The module id in an address is only a key into the allow-list (ids are checked against MODULE_ID first); nothing else is ever passed to import().
// show(id, { path, query }) / open(address, query) resolve to 'ok' | 'forbidden' | 'not-found' | 'error' | 'superseded'.
//
// ctx (what a module and its pages receive) is documented in js/app/module.js.
import { createLogger } from '../log.js';
import { createPage, BUSY_DELAY } from '../page.js';
import { createStore } from '../store.js';
import { matchRoute } from '../route-tree.js';
import { loadElements } from '../loader.js';
import { setTheme, currentTheme, toggleTheme } from '../theme-core.js';
import { MODULE_ID, defineModule, pageTypeFor, layoutFor } from './module.js';
import { createBoundary, loadWithRetry } from './boundary.js';

const log = createLogger('app');
const norm = p => '/' + String(p ?? '').split(/[?#]/)[0].split('/').filter(Boolean).join('/');
const join = (id, p) => `/${id}${norm(p) === '/' ? '' : norm(p)}`;
const cleanupOf = out => (typeof out === 'function' ? out : out?.destroy ? () => out.destroy() : null);
const pick = (o, keys) => (o ? Object.fromEntries(keys.split(' ').map(k => [k, o[k]])) : null);
const safe = async (fn, what, lg) => { try { await fn?.(); } catch (e) { lg.error(`${what} threw`, e); } };

export function createModuleHost(container, { modules = [], router, auth, can, store, settings, services, tasks, notify, dialogs, timeout = 10000, retries = 1, backoff = 300, elements = loadElements } = {}) {
    const allow = new Map();
    for (const m of modules) {
        if (!m || typeof m.id !== 'string' || !MODULE_ID.test(m.id) || typeof m.load !== 'function' || allow.has(m.id)) throw new TypeError(`createModuleHost: bad, missing or duplicate module entry ${JSON.stringify(m?.id)}`);
        allow.set(m.id, m);
    }
    const doc = container.ownerDocument;
    const root = doc.documentElement;
    // Elements are loaded after what the host or a page adds is in the page.
    const load = () => Promise.resolve(elements(box.root)).catch(e => log.error('elements failed to load', e));
    const box = createBoundary(doc, load);
    container.replaceChildren(box.root);
    load();
    // The previous module is covered while the next loads (after BUSY_DELAY).
    const hostPage = createPage({ overlay: box.busy, delay: BUSY_DELAY, scope: 'app' });

    let st = store, token = 0, active = null, last = null, dead = false, turn = Promise.resolve();
    const timers = new Map(), defs = new Map();
    const alive = t => !dead && t === token;
    const getStore = () => (st ??= createStore());
    // Steps that change what is mounted run one at a time, in request order.
    const exclusive = fn => { const p = turn.then(fn); turn = p.catch(e => log.error('module step failed', e)); return p; };
    const wait = ms => new Promise(resolve => { const id = setTimeout(() => { timers.delete(id); resolve(); }, ms); timers.set(id, resolve); });
    const within = (promise, ms) => {
        let id;
        const timeoutP = new Promise((_, reject) => { id = setTimeout(() => reject(Object.assign(new Error(`no answer after ${ms} ms`), { userFacing: true })), ms); timers.set(id, () => {}); });
        return Promise.race([promise, timeoutP]).finally(() => { clearTimeout(id); timers.delete(id); });
    };

    // true, or { allow: false, redirect }: the first check that is not true wins; a throw denies.
    const verdict = (id, route, ...checks) => {
        for (const check of checks) {
            if (!check) continue;
            try {
                const r = check({ auth, id, route });
                if (!(r === true || r?.allow === true)) return { allow: false, redirect: r?.allow === false ? r.redirect ?? null : null };
            } catch (e) {
                log.error(`can() threw for "${id}": denied`, e);
                return { allow: false, redirect: null };
            }
        }
        return true;
    };
    const access = (entry, def, route) => verdict(entry.id, route, can && (c => can(entry, c)), entry.can, def?.can);

    // Tracked resources: what on/observe/after/signal register ends with end(); late calls do nothing.
    function scope(lg, busy) {
        const ac = new AbortController(), off = new Set();
        // ctx.tasks: on end, cancellable tasks are cancelled, the others continue with their toast (js/tasks.js).
        const ts = tasks?.scope({ busy });
        const ns = notify?.scope(), ds = dialogs?.scope();
        const own = fn => (off.add(fn), fn);
        const live = what => !ac.signal.aborted || (lg.warn(`${what}() after the end of its scope ignored`), false);
        const api = {
            signal: ac.signal,
            tasks: pick(ts, 'run'),
            notify: pick(ns, 'info success warn error'),
            dialogs: pick(ds, 'confirm alert prompt open'),
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
            ts?.end(); ns?.end(); ds?.end();
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
            ...services, id, auth, log: lg, page, store: facade, settings: settings ?? null,
            get route() { return s.route; },
            navigate: (p, o) => (router ? router.navigate(join(id, p), o) : (lg.warn('navigate: no router was given to the host'), false)),
            href: (p, params, query) => (router ? router.href(join(id, p), params, query) : null),
        };
        const mine = scope(lg, page.begin);
        return {
            ctx: Object.create(base, mine.api), lg,
            // A ctx for one page: the same members, with resources that end when the page is left.
            pageScope() { const p = scope(lg, page.begin); return { ctx: Object.create(base, p.api), end: p.end }; },
            // Ends everything the module registered; nothing here can throw.
            async dispose() {
                await mine.end();
                facade?.destroy();
                page.destroy();
                page.clearStatus();
            },
        };
    }

    // A route with persist: true keeps its page (a.kept, by route node) hidden while another shows; leaving the module frees it.
    const free = async (a, e) => { for (const f of [e.page, e.end]) await safe(f, 'page cleanup', a.lg); e.host.remove(); a.kept.delete(e.node); };
    const dropPage = async a => { const e = a.page; a.page = null; if (e) await (a.kept.get(e.node) === e ? (e.host.hidden = true) : free(a, e)); };
    const leave = () => { const a = active; active = null; return a && end(a); };
    async function end(a) {
        await dropPage(a);
        for (const e of a.kept.values()) await free(a, e);
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
        const keep = m.node.persist === true, key = JSON.stringify(route.params), old = a.kept.get(m.node);
        const place = host => { for (const c of [...box.body.children]) c.hasAttribute('data-pk-page') || c.remove(); host.parentNode ?? box.body.append(host); };
        if (old?.key === key) { box.ready(); place(old.host); old.host.hidden = false; a.page = old; return 'ok'; }
        if (old) await free(a, old);
        const host = doc.createElement('div'), sc = a.pageScope();
        host.setAttribute('data-pk-page', spec.type);
        try {
            if (!factory || (m.node.layout && !layout)) throw new Error(!factory ? `the page type "${spec.type}" is not available` : `the layout "${m.node.layout}" is not available`);
            box.ready();
            place(host);
            const into = (layout && (await layout(host, sc.ctx))) || host;
            const cfg = typeof spec.config === 'function' ? spec.config(route, sc.ctx) : spec.config;
            const cleanup = cleanupOf(await factory(into, cfg, sc.ctx));
            load();
            if (!alive(t) || a !== active) { await free(a, { page: cleanup, end: sc.end, host }); return 'superseded'; }
            a.page = { page: cleanup, end: sc.end, host, node: m.node, key };
            if (keep) a.kept.set(m.node, a.page);
            return 'ok';
        } catch (e) {
            a.lg.error(`the page for ${route.path} failed`, e);
            await free(a, { end: sc.end, host });
            if (alive(t) && a === active) box.fail(`Could not show ${a.entry.title}`, e, () => show(a.entry.id, r));
            return 'error';
        }
    }

    // Run exclusively once the module is loaded: check access, then show the page or switch modules.
    async function apply(entry, def, r, t) {
        if (!alive(t)) return 'superseded';
        if (!def || access(entry, def, r) !== true) { await leave(); if (!alive(t)) return 'superseded'; box.forbidden(entry.title); return 'forbidden'; }
        if (active?.entry === entry) return showPage(active, r, t);
        await leave();
        if (!alive(t)) return 'superseded';
        const s = { route: { path: '/', params: {}, query: {} } };
        const { ctx, dispose, lg, pageScope } = makeCtx(entry, def, s);
        const a = { entry, def, ctx, dispose, lg, pageScope, state: s, page: null, kept: new Map(), cleanup: null };
        try {
            a.cleanup = cleanupOf(await def.mount?.(ctx));
        } catch (e) {
            lg.error('mount threw', e);
            await dispose();
            if (alive(t)) box.fail(`Could not start ${entry.title}`, e, () => show(entry.id, r));
            return alive(t) ? 'error' : 'superseded';
        }
        if (!alive(t)) { await end(a); return 'superseded'; }
        active = a;
        return showPage(a, r, t);
    }

    async function run(id, r, t) {
        const entry = typeof id === 'string' && MODULE_ID.test(id) ? allow.get(id) : undefined;
        if (!entry) return exclusive(async () => { if (!alive(t)) return 'superseded'; await leave(); box.notFound('There is no such page.'); return 'not-found'; });
        let def = defs.get(id);
        if (!def && access(entry, null, r) === true) {
            // Only an allow-listed loader is called, and not for a module denied at the door.
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
        if (alive(t)) globalThis.performance?.measure?.(`pk-route:${allow.has(id) ? id : '?'}`, { start: t0 });
        return status;
    }

    return {
        show,
        // An address '/<module>/<path>' (a hash-mode router's `url`) with its query: the first segment is the module id.
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
