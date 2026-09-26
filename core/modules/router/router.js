// A router/state module: one route tree, declared once, that says where the page is and derives the breadcrumb trail from it, so no
// page builds its own list. It does not render anything and never owns an element; createPage (js/page.js) takes it as `router` and
// drives the page's breadcrumb and title from it. The vanilla SDK has no other router; PlainKit.Blazor keeps NavigationManager
// (issue 219 records the Blazor side as a follow-up), so nothing here replaces or fights a framework router.
//
// A route tree is a nested array: { path, label, children?, crumb? }. `path` is the full path ('/orders/:id'; a `:name` segment
// captures), `label` is a string or (params) => string, `crumb: false` leaves the route out of the trail; a route with path '*' answers
// any path nothing else matches. A path with no route is "not found": current() is null and crumbs() is empty (unless a not-found route
// exists, below). Static segments beat a :param at the same depth.
//
//   import { mountRouter } from './plainkit/modules/router/router.js';
//   import { createPage } from './plainkit/js/page.js';
//   const router = mountRouter(document.body, {
//       routes: [{ path: '/', label: 'Home', children: [
//           { path: '/orders', label: 'Orders', children: [{ path: '/orders/:id', label: p => `Order ${p.id}` }] },
//       ] }],
//       intercept: true, // same-origin <a> clicks inside the container become router.navigate(href)
//   });
//   const page = createPage({ breadcrumb: document.getElementById('crumbs'), router });
//   router.navigate('/orders/7'); // crumbs: Home > Orders > Order 7, document.title 'Order 7'
//   router.destroy();
//
// Hash mode (for an app on static hosting: no server rewrites): mountRouter(el, { routes, mode: 'hash' }) reads and writes
// '#/<path>?<query>' (the query lives inside the hash: '#/gallery/elements/pk-button?nav=top') and follows 'hashchange'. `mode` is 'path'
// (the default, pushState on the pathname) or 'hash'. These options work in both modes:
//   guard    (route) => true | { allow: false, redirect?: '/app/path' }. Runs on every address before anything is resolved or rendered. Only
//            true (or { allow: true }) lets the route through; anything else, and a guard that throws, denies it (fail closed: current().status
//            is 403 and no route is reported). A redirect is followed only when it is an app-relative path (safeRoute, js/safe-url.js rules),
//            never another site, so a guard cannot become an open redirect. route = { path, params, query, node, notFound }. A client guard is
//            UX only; the server stays the source of truth.
//   aliases  { '/elements/:name': '/gallery/elements/:name' }: old addresses that keep working. :params and the query carry over and the
//            address is replaced (no extra history entry). A value may be a function (path, query, params) => new address | null, for the old
//            '#path=a&line=2' form (a query on '/'). Only app-relative results are followed; a loop stops after 5 hops.
//   notFound a route node or a label string for a path nothing matches (a '*' route in the tree does the same). Hash mode always has one
//            ('Not found'), so there an unknown address is a normal match with status 404, never an exception and never null.
// current() is { path, url, params, query, label, status } (status 200, 404 or 403) or null. `path` is the route's pattern, `url` the address.
// params and query are untrusted text: put them in the page with textContent only. A same-page anchor ('#/guides/x/heading') is just a path the router
// reports; the page type scrolls to it. navigate(to, { replace }) takes an app-relative path with an optional query and refuses anything else.

import { createLogger } from '../../js/log.js';
import { matchRoute, buildCrumbs, fillPath, labelOf, parseHash, buildHash, mapAlias, safeRoute } from '../../js/route-tree.js';

export { flattenRoutes, matchRoute, buildCrumbs, fillPath, navRoutes, buildNavCrumbs, parseHash, buildHash, mapAlias, safeRoute } from '../../js/route-tree.js';

const log = createLogger('router');
const HOPS = 5; // alias and guard redirects followed for one address before it is given up

// Options: routes (the tree), intercept (path mode only, default false), base (path prefix the app is served under, default ''),
// mode ('path' | 'hash', default 'path'), guard, aliases, notFound (see the header).
export function mountRouter(container, { routes = [], intercept = false, base = '', mode = 'path', guard, aliases, notFound } = {}) {
    if (mode !== 'path' && mode !== 'hash') throw new TypeError(`mountRouter: mode must be 'hash' or 'path', not ${JSON.stringify(mode)}`);
    const hash = mode === 'hash';
    const win = globalThis.window ?? globalThis;
    const listeners = new Set();
    const nf = notFound == null ? (hash ? { path: '*', label: 'Not found' } : null) : { ...(typeof notFound === 'string' ? { label: notFound } : notFound), path: '*' };
    let dead = false;

    const read = () => {
        if (hash) return parseHash(win.location?.hash);
        const p = win.location?.pathname ?? '/';
        return { path: base && p.startsWith(base) ? p.slice(base.length) || '/' : p, query: Object.fromEntries(new URLSearchParams(win.location?.search ?? '')) };
    };
    const write = (to, replace) => win.history[replace ? 'replaceState' : 'pushState'](null, '', hash ? '#' + to : base + to);
    const verdict = route => {
        try {
            const r = guard(route);
            return r === true || r?.allow === true ? true : { redirect: r?.allow === false ? r.redirect : null };
        } catch (e) {
            log.error(`the guard threw for "${route.path}", the route is denied`, e);
            return { redirect: null };
        }
    };

    // The address now, after aliases and the guard: { route, match, status }. Nothing is resolved or rendered before this says so.
    function evaluate(hops = 0) {
        const { path, query } = read();
        const alias = aliases ? mapAlias(aliases, path, query) : null;
        if (alias != null) {
            const to = safeRoute(alias);
            if (to && hops < HOPS) { write(to, true); return evaluate(hops + 1); }
            log.warn(`alias for "${path}" ignored: ${to ? 'too many redirects' : 'not an app-relative path'}`);
        }
        const m = matchRoute(routes, path) ?? (nf && { node: nf, chain: [nf], params: {}, notFound: true });
        const route = { path, params: m?.params ?? {}, query, node: m?.node ?? null, notFound: !!m?.notFound };
        if (guard) {
            const v = verdict(route);
            if (v !== true) {
                const to = safeRoute(v.redirect);
                if (to && hops < HOPS) { write(to, true); return evaluate(hops + 1); }
                if (v.redirect != null) log.warn(`guard redirect for "${path}" ignored: ${to ? 'too many redirects' : 'not an app-relative path'}`);
                return { route, match: null, status: 403 };
            }
        }
        return { route, match: m, status: m && !m.notFound ? 200 : 404 };
    }

    let state = evaluate();
    if (!state.match && state.status !== 403) log.debug(`no route for "${state.route.path}"`);

    function sync() {
        state = evaluate();
        if (!state.match && state.status !== 403) log.warn(`no route for "${state.route.path}", the trail is empty`);
        for (const fn of [...listeners]) fn(handle);
    }

    function navigate(to, { replace = false } = {}) {
        const target = safeRoute(to);
        if (dead || !target) { if (!dead) log.warn('navigate refused: not an app-relative path', { to }); return false; }
        write(target, replace);
        sync();
        return true;
    }

    const event = hash ? 'hashchange' : 'popstate';
    const onPop = () => sync();
    const onClick = e => {
        const a = e.target?.closest?.('a[href]');
        if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
        const url = new URL(a.href, win.location.href);
        if (url.origin !== win.location.origin) return;
        e.preventDefault();
        navigate(url.pathname + url.search + url.hash);
    };
    win.addEventListener?.(event, onPop);
    const clicks = intercept && !hash && container; // in hash mode a link to '#/x' is already a navigation
    if (clicks) container.addEventListener('click', onClick);

    const handle = {
        mode,
        current() {
            const { route, match, status } = state;
            if (status === 403) return { path: route.path, url: route.path, params: {}, query: { ...route.query }, label: '', status };
            return match ? { path: match.node.path, url: route.path, params: { ...match.params }, query: { ...route.query }, label: labelOf(match.node, match.params), status } : null;
        },
        crumbs: () => (state.match ? buildCrumbs(state.match) : []),
        href: (path, params, query) => (hash ? buildHash(fillPath(path, params), query) : base + fillPath(path, params)),
        navigate,
        // fn(handle) runs on every route change; returns the unsubscribe function.
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        destroy() {
            dead = true;
            win.removeEventListener?.(event, onPop);
            if (clicks) container.removeEventListener('click', onClick);
            listeners.clear();
        },
    };
    return handle;
}
