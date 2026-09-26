// App module definition (#349, step 3 of the app framework #346): what a module IS, before anything runs it. Pure, no DOM, so a tool or a node test can read a module without mounting it.
//
//   import { defineModule } from './plainkit/js/app.js';
//   export default defineModule({
//       id: 'orders',                                   // ^[a-z][a-z0-9-]{0,39}$; the key the app config's allow-list and the address '#/orders/...' use
//       title: 'Orders', icon: 'list',
//       nav: ctx => [{ id: 'all', title: 'All orders', route: '/' }],   // the module's own side nav: an array or (ctx) => array of { id, title, route|href, children? }
//       routes: [                                        // module-relative; the module id prefix is added by the app. page = a type id, or { type, config }
//           { path: '/', page: 'custom', config: { mount: (el, ctx) => mountOrders(el) } },   // config: data, or ({ path, params, query }, ctx) => data
//           { path: '/:id', page: 'custom', config: ({ params }) => ({ mount: el => showOrder(el, params.id) }), can: ctx => ctx.auth?.has('orders.read') ?? true },
//           { path: '*', page: 'not-found' },
//       ],
//       state: { version: 1, defaults: { q: '' }, persist: ['q'] },   // a store.module() spec (js/store.js): ctx.store is this module's own namespace
//       can: ctx => ctx.auth?.has('orders.read') ?? true,             // access hook; true or { allow: false, redirect }; anything else, and a throw, denies (fail closed)
//       mount(ctx) { return () => {}; }, unmount(ctx) {},             // optional; a function returned from mount is cleanup
//       pageTypes: { kanban: (host, config, ctx) => ({ destroy() {} }) },  // page types only this module has (below); layouts: { name: (host, ctx) => element }
//   });
//
// defineModule returns its argument and throws a TypeError naming the module and the mistake (bad id, duplicate route, a nav that is not an array or function...).
// The host (js/app/host.js) validates again after a lazy import, so a module cannot skip it.
//
// Page types and layouts. The built-in page type ids are reserved (BUILT_IN_PAGE_TYPES); step 3 implements 'custom' (config.mount(host, ctx) returns cleanup or { destroy() })
// and 'not-found', the rest arrive with steps 5 to 7. Extend the set three ways, all through the same factory shape
// (host, config, ctx) => cleanup function | { destroy() } | nothing (a promise of it is awaited):
//   the module   defineModule({ pageTypes: { kanban }, layouts: { split } }): only that module's routes can name them;
//   the app      registerPageType('kanban', factory), registerLayout('split', factory): every module can;
//   a route      { path, page: { type: 'kanban', config }, layout: 'split' }.
// A layout is (host, ctx) => element: it may build chrome around `host` and returns the element the page type mounts into (host itself when it returns nothing).
// Lookup is module, then app, then built-in; a built-in id can never be shadowed or registered, and a name is used only as a key into these tables.
//
// ctx, what a module and its pages receive (the tracker's list, minus what only the shell has: search, toast, confirm arrive with mountApp):
//   id                 the module id.
//   page               createPage (js/page.js) bound to the module's own alert and body (the framework wraps it in its busy overlay): setStatus, setError, busy(fn, label), begin(label), setTitle (no breadcrumb until the shell).
//   store              the module's namespaced state (js/store.js facade: get, set, patch, subscribe, reset), or null without `state`. Its subscriptions end on unmount.
//   settings           what the app passed as `settings`, or null.
//   theme              { name, set(name), toggle(), subscribe(fn) } for the document's data-theme (js/theme.js); subscribe is a tracked MutationObserver, created on demand.
//   route              { path, params, query } now, module-relative; params and query are untrusted text (textContent only).
//   navigate(path, { replace }) / href(path, params, query)   module-relative links through the router; navigate returns false without one.
//   log                createLogger('app:<id>').
//   on(target, type, fn, options) / observe(observer, target, options) / after(ms, fn)   listeners, observers and one-shot timers that core removes; each returns how to
//                      stop it early. Called after that end they do nothing and warn.
//   tasks              { run(spec) } from the app's task manager (js/tasks.js): long work shown as progress toasts; null when the app has none. Ends with this ctx: cancellable tasks cancel, the others continue.
//   signal             an AbortSignal that aborts at that end (pass it to fetch).
//   auth               what the app passed as `auth`.
// The ctx of mount/unmount ends on unmount. A page factory gets its own ctx with the same members whose on/observe/after/signal end when the page is left (a route change
// or the module unmounting), so a module that changes route a thousand times holds only the current page's resources.
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
    const seen = new Set();
    for (const r of def.routes ?? []) {
        const path = r?.path;
        if (typeof path !== 'string' || !(path === '*' || path[0] === '/')) fail(id, `a route path must be '*' or start with '/', not ${JSON.stringify(path)}`);
        const shape = segmentsOf(path).map(s => (s[0] === ':' ? ':' : s)).join('/') + (path === '*' ? '*' : '');
        if (seen.has(shape)) fail(id, `duplicate route ${path}`);
        seen.add(shape);
        const type = typeof r.page === 'string' ? r.page : r.page?.type;
        if (typeof type !== 'string' || !MODULE_ID.test(type)) fail(id, `route ${path} needs page: 'type' or { type }`);
        if (r.can !== undefined && !isFn(r.can)) fail(id, `route ${path}: can must be a function`);
    }
    if (def.routes !== undefined && !Array.isArray(def.routes)) fail(id, 'routes must be an array');
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

const custom = (host, config, ctx) => {
    if (!isFn(config?.mount)) throw new TypeError("page type 'custom' needs config.mount(host, ctx)");
    return config.mount(host, ctx);
};
// The factory for a page type id: the module's own, then the app's, then a built-in one that exists yet; undefined when there is none.
export const pageTypeFor = (def, id) => (own(def.pageTypes, id) ? def.pageTypes[id] : types.get(id) ?? (id === 'custom' ? custom : undefined));
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
