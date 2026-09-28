// App module definition (#349, step 3 of the app framework #346): what a module IS, before anything runs it. Pure, no DOM, so a tool or a node test can read a module without mounting it.
//
//   import { defineModule } from './plainkit/js/app.js';
//   export default defineModule({
//       id: 'orders',                                   // ^[a-z][a-z0-9-]{0,39}$; the key the allow-list and the address '#/orders/...' use
//       title: 'Orders', icon: 'list',
//       nav: ctx => [{ id: 'all', title: 'All orders', route: '/' }],   // side nav: STRUCTURE (a few stable destinations), never one per record (js/app/nav.js)
//       routes: [                                        // module-relative; the app adds the module id prefix. page = a type id, or { type, config }
//           { path: '/', page: 'custom', config: { mount: (el, ctx) => mountOrders(el) } },   // config: data, or ({ path, params, query }, ctx) => data
//           { path: '/:id', page: 'custom', label: p => `Order ${p.id}`, config: ({ params }) => ({ mount: el => showOrder(el, params.id) }), can: ctx => ctx.auth?.has('orders.read') ?? true },
//           { path: '*', page: 'not-found' },
//       ],                                               // a route tree: a record route goes in its list's `children` (full paths), `label` is its breadcrumb
//       state: { version: 1, defaults: { q: '' }, persist: ['q'] },   // a store.module() spec (js/store.js): ctx.store is this module's own namespace
//       can: ctx => ctx.auth?.has('orders.read') ?? true,             // access hook; true or { allow: false, redirect }; else, or a throw, denies (fail closed)
//       mount(ctx) { return () => {}; }, unmount(ctx) {},             // optional; a function returned from mount is cleanup
//       pageTypes: { kanban: (host, config, ctx) => ({ destroy() {} }) },  // page types only this module has (below); layouts: { name: (host, ctx) => element }
//   });
//
// defineModule returns its argument and throws a TypeError naming the module and the mistake (bad id, duplicate route, a nav that is not an array or function...).
// The host (js/app/host.js) validates again after a lazy import, so a module cannot skip it.
//
// Page types and layouts. The built-in page type ids are reserved (BUILT_IN_PAGE_TYPES); 'custom', 'states', 'tool', 'settings', 'not-found',
// 'list', 'dashboard', 'workspace', 'master-detail', 'record', 'doc' and 'wizard' are built in (each a chunk in js/app/pages/, below), the rest arrive later. Extend the set three ways, all through the same factory shape
// (host, config, ctx) => cleanup function | { destroy() } | nothing (a promise of it is awaited):
//   the module   defineModule({ pageTypes: { kanban }, layouts: { split } }): only that module's routes can name them;
//   the app      registerPageType('kanban', factory), registerLayout('split', factory): every module can;
//   a route      { path, page: { type: 'kanban', config }, layout: 'split' }.
// A layout is (host, ctx) => element: it may build chrome around `host`, returning the element the page type mounts into (host itself if none).
// Lookup is module, then app, then built-in; a built-in id can never be shadowed or registered, and a name is only a key into these tables.
//
// ctx, what a module and its pages receive (the tracker's list, minus what only the shell has: search, toast, confirm arrive with mountApp):
//   id                 the module id.
//   page               createPage (js/page.js) bound to the module's own alert and body (wrapped in the busy overlay): setStatus, setError, busy(fn, label), begin(label), setTitle (no breadcrumb until the shell).
//   store              the module's namespaced state (js/store.js: get, set, patch, subscribe, reset), null without `state`; subscriptions end on unmount.
//   settings           what the app passed as `settings`, or null.
//   theme              { name, set(name), toggle(), subscribe(fn) } for data-theme (js/theme.js); subscribe is a tracked MutationObserver, on demand.
//   route              { path, params, query } now, module-relative; params and query are untrusted text (textContent only).
//   navigate(path, { replace }) / href(path, params, query)   module-relative router links; navigate returns false without one.
//   log                createLogger('app:<id>').
//   on/observe/after   listeners, observers and one-shot timers core removes at that end; each call returns a stop-early fn; called after, they warn and no-op.
//   tasks              { run(spec) } (js/tasks.js): long work as progress toasts; null without a manager. Ends with this ctx: cancellables cancel, others continue.
//   notify             { info, success, warn, error }(title, details?, opts?) (js/notify.js); null without one; ends with this ctx: its toasts finish.
//   dialogs            { confirm, alert, prompt, open }(config) -> Promise (js/dialogs.js), one modal app-wide; null without one; ends with this ctx: its dialogs cancel.
//   signal             an AbortSignal that aborts at that end (pass it to fetch).
//   auth               what the app passed as `auth`.
// The ctx of mount/unmount ends on unmount. A page factory gets its own ctx (same members) whose on/observe/after/signal end when the page is
// left (a route change or the module unmounting), so a module that changes route a thousand times holds only the current page's resources.
import { flattenRoutes } from '../route-tree.js';
import { createLogger } from '../log.js';
import { setTheme, currentTheme, toggleTheme } from '../theme.js';
export const MODULE_ID = /^[a-z][a-z0-9-]{0,39}$/;
export const BUILT_IN_PAGE_TYPES = Object.freeze(['list', 'record', 'dashboard', 'tool', 'settings', 'doc', 'workspace', 'master-detail', 'wizard', 'custom', 'not-found', 'states']);

const own = (obj, key) => obj != null && Object.hasOwn(obj, key);
const fail = (id, why) => { throw new TypeError(`defineModule(${JSON.stringify(id)}): ${why}`); };
const isFn = v => typeof v === 'function';
const segmentsOf = path => path.split(/[?#]/)[0].split('/').filter(Boolean);

function checkNav(id, items, at = 'nav') {
    if (!Array.isArray(items)) fail(id, `${at} must be an array or a function returning one`);
    for (const n of items) {
        if (!n || typeof n.id !== 'string' || typeof n.title !== 'string') fail(id, `${at} items need a string id and title`);
        if (n.children !== undefined) checkNav(id, n.children, `${at}.${n.id}.children`);
    }
}

export function defineModule(def) {
    const id = def?.id;
    if (typeof id !== 'string' || !MODULE_ID.test(id)) fail(id, 'id must match ^[a-z][a-z0-9-]{0,39}$');
    for (const k of ['can', 'mount', 'unmount']) if (def[k] !== undefined && !isFn(def[k])) fail(id, `${k} must be a function`);
    if (def.nav !== undefined && !isFn(def.nav)) checkNav(id, def.nav);
    if (def.routes !== undefined && !Array.isArray(def.routes)) fail(id, 'routes must be an array');
    const seen = new Set();
    for (const { node: r } of flattenRoutes(def.routes ?? [])) {
        const path = r?.path;
        if (typeof path !== 'string' || !(path === '*' || path[0] === '/')) fail(id, `a route path must be '*' or start with '/', not ${JSON.stringify(path)}`);
        const shape = segmentsOf(path).map(s => (s[0] === ':' ? ':' : s)).join('/') + (path === '*' ? '*' : '');
        if (seen.has(shape)) fail(id, `duplicate route ${path}`);
        seen.add(shape);
        const type = typeof r.page === 'string' ? r.page : r.page?.type;
        if (typeof type !== 'string' || !MODULE_ID.test(type)) fail(id, `route ${path} needs page: 'type' or { type }`);
        if (r.can !== undefined && !isFn(r.can)) fail(id, `route ${path}: can must be a function`);
    }
    const s = def.state;
    if (s !== undefined) {
        if (typeof s !== 'object' || s === null || (s.defaults !== undefined && typeof s.defaults !== 'object')) fail(id, 'state must be an object with defaults');
        const keys = Object.keys(s.defaults ?? {});
        for (const list of ['persist', 'publish']) if (s[list] !== undefined && !(Array.isArray(s[list]) && s[list].every(k => keys.includes(k)))) fail(id, `state.${list} must list keys of state.defaults`);
    }
    for (const [table, what] of [[def.pageTypes, 'pageTypes'], [def.layouts, 'layouts']]) {
        for (const [name, fn] of Object.entries(table ?? {})) {
            if (!MODULE_ID.test(name) || !isFn(fn)) fail(id, `${what}.${name} must be a function under an id like 'kanban'`);
            if (what === 'pageTypes' && BUILT_IN_PAGE_TYPES.includes(name)) fail(id, `${what}.${name} is a built-in page type and cannot be replaced`);
        }
    }
    return def;
}

const types = new Map();
const layouts = new Map();
const register = (table, what, name, fn) => {
    if (!MODULE_ID.test(name) || !isFn(fn) || table.has(name) || (what === 'page type' && BUILT_IN_PAGE_TYPES.includes(name))) throw new TypeError(`register: bad, taken or built-in ${what} "${name}"`);
    table.set(name, fn);
};
// App-wide page type / layout (see the header). Throws on a bad, taken or built-in name.
export const registerPageType = (id, factory) => register(types, 'page type', id, factory);
export const registerLayout = (id, factory) => register(layouts, 'layout', id, factory);

// The built-in page types live in js/app/pages/<id>.js (a default-exported factory each), fetched by the first route that names one (#346). pageTypeFor stays
// synchronous: a built-in answers a wrapper whose promise (awaited by the host and mountPage) is the factory's own result; a failed import rejects it, so the boundary shows it like any page error.
const BUILT_IN = new Map(['custom', 'states', 'tool', 'settings', 'not-found', 'list', 'dashboard', 'workspace', 'master-detail', 'record', 'doc', 'wizard'].map(id => [id, (host, config, ctx) => import(`./pages/${id}.js`).then(m => m.default(host, config, ctx))]));
// The factory for a page type id: the module's own, then the app's, then a built-in one that exists yet; undefined when there is none.
// BUILT_IN is a Map, not a plain object: a lookup for '__proto__'/'constructor'/'toString' must answer undefined, never Object.prototype's own.
export const pageTypeFor = (def, id) => (own(def.pageTypes, id) ? def.pageTypes[id] : types.get(id) ?? BUILT_IN.get(id));
export const layoutFor = (def, id) => (own(def.layouts, id) ? def.layouts[id] : layouts.get(id));

// Wraps an existing mountX(container, options) tool module (mountLogs, mountLogSettings, mountScorecard...) as a module with one 'custom' page, unchanged:
//   export default moduleFromMount(mountLogSettings, { id: 'log-settings', title: 'Logging', options: { height: 'fill' } });
// `meta` is the defineModule fields (id, title, icon, can, state...) plus `options`, an object or (ctx) => object passed to mountFn. The handle mountFn returns
// (or resolves to) is destroyed on unmount, whatever the outcome of a mount that was cancelled while it was still starting.
export function moduleFromMount(mountFn, { options, ...meta } = {}) {
    if (!isFn(mountFn)) throw new TypeError('moduleFromMount: the first argument must be a mountX(container, options) function');
    const mount = async (host, ctx) => {
        const handle = await mountFn(host, isFn(options) ? options(ctx) : options ?? {});
        return () => handle?.destroy?.();
    };
    return defineModule({ ...meta, routes: [{ path: '*', page: 'custom', config: { mount } }] });
}

// mountPage(container, page, options): the one-page consumer from #351's title - a page type with no module or app around it. `page`: a
// type id, or { type, config }. ctx is a SUBSET of a module page's ctx (header, above): id/log/auth/settings/store/theme/on/observe/after/
// signal work the same (tracked, undone by destroy()); route/page/tasks/notify/dialogs stay null; navigate()/href() fail closed, warning.
// Returns Promise<{ destroy() }>.
export async function mountPage(container, page, options = {}) {
    const type = typeof page === 'string' ? page : page?.type;
    if (typeof type !== 'string') throw new TypeError('mountPage: page must be a type id, or { type, config }');
    const factory = pageTypeFor({}, type);
    if (!isFn(factory)) throw new TypeError(`mountPage: page type "${type}" is not available`);
    const config = typeof page === 'string' ? undefined : page?.config;
    const { id = 'page', auth = null, settings = null, store = null, root = container.ownerDocument?.documentElement } = options;
    const lg = createLogger(`app:${id}`);
    const ac = new AbortController();
    const offs = new Set();
    const run = (fn, what) => { try { fn?.(); } catch (e) { lg.error(`${what} threw`, e); } };
    const track = off => { if (ac.signal.aborted) { lg.warn('mountPage: used after destroy() ignored'); return off; } offs.add(off); return off; };
    const ctx = {
        id, auth, settings, store, log: lg, route: null, page: null, tasks: null, notify: null, dialogs: null, signal: ac.signal,
        navigate: () => (lg.warn('navigate: mountPage has no router'), false),
        href: () => null,
        on: (t, type, fn, o) => { t.addEventListener(type, fn, o); return track(() => t.removeEventListener(type, fn, o)); },
        observe: (o, t, opt) => { o.observe(t, opt); track(() => o.disconnect()); return o; },
        after(ms, fn) { const t = setTimeout(() => { offs.delete(off); run(fn, 'after() callback'); }, ms); const off = () => clearTimeout(t); return track(off); },
        theme: root ? {
            get name() { return currentTheme(root); },
            set: n => setTheme(root, n),
            toggle: () => toggleTheme(root),
            subscribe(fn) {
                const mo = new (container.ownerDocument?.defaultView?.MutationObserver ?? MutationObserver)(() => fn(currentTheme(root)));
                ctx.observe(mo, root, { attributes: true, attributeFilter: ['data-theme'] });
                return () => mo.disconnect();
            },
        } : null,
    };
    const out = await factory(container, config, ctx);
    const cleanup = typeof out === 'function' ? out : out?.destroy?.bind(out);
    return {
        destroy() {
            ac.abort();
            for (const off of [...offs].reverse()) run(off, 'cleanup');
            offs.clear();
            run(cleanup, 'page cleanup');
        },
    };
}
