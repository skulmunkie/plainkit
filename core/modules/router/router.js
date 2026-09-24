// A router/state module: one route tree, declared once, that says where the page is and derives the breadcrumb trail from it, so no
// page builds its own list. It does not render anything and never owns an element; createPage (js/page.js) takes it as `router` and
// drives the page's breadcrumb and title from it. The vanilla SDK has no other router; PlainKit.Blazor keeps NavigationManager
// (issue 219 records the Blazor side as a follow-up), so nothing here replaces or fights a framework router.
//
// A route tree is a nested array: { path, label, children?, crumb? }. `path` is the full path ('/orders/:id'; a `:name` segment
// captures), `label` is a string or (params) => string, `crumb: false` leaves the route out of the trail. A path with no route is
// "not found": current() is null and crumbs() is empty. Static segments beat a :param at the same depth.
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

import { createLogger } from '../../js/log.js';
import { matchRoute, buildCrumbs, fillPath, labelOf } from '../../js/route-tree.js';

export { flattenRoutes, matchRoute, buildCrumbs, fillPath } from '../../js/route-tree.js';

const log = createLogger('router');

// Options: routes (the tree), intercept (default false), base (path prefix the app is served under, default '').
export function mountRouter(container, { routes = [], intercept = false, base = '' } = {}) {
    const win = globalThis.window ?? globalThis;
    const listeners = new Set();
    const pathNow = () => {
        const p = win.location?.pathname ?? '/';
        return base && p.startsWith(base) ? p.slice(base.length) || '/' : p;
    };
    let match = matchRoute(routes, pathNow());
    if (!match) log.debug(`no route for "${pathNow()}"`);

    function sync() {
        const path = pathNow();
        match = matchRoute(routes, path);
        if (!match) log.warn(`no route for "${path}", the trail is empty`);
        for (const fn of [...listeners]) fn(handle);
    }

    function navigate(path) {
        win.history.pushState(null, '', base + path);
        sync();
    }

    const onPop = () => sync();
    const onClick = e => {
        const a = e.target?.closest?.('a[href]');
        if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
        const url = new URL(a.href, win.location.href);
        if (url.origin !== win.location.origin) return;
        e.preventDefault();
        navigate(url.pathname + url.search + url.hash);
    };
    win.addEventListener?.('popstate', onPop);
    if (intercept && container) container.addEventListener('click', onClick);

    const handle = {
        current: () => (match ? { path: match.node.path, params: { ...match.params }, label: labelOf(match.node, match.params) } : null),
        crumbs: () => buildCrumbs(match),
        href: (path, params) => base + fillPath(path, params),
        navigate,
        // fn(handle) runs on every route change; returns the unsubscribe function.
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        destroy() {
            win.removeEventListener?.('popstate', onPop);
            if (intercept && container) container.removeEventListener('click', onClick);
            listeners.clear();
        },
    };
    return handle;
}
