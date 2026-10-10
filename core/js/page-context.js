// The page context for a page that is not under mountApp (#670): the same { ids, section, current, crumbs, title } that mountApp feeds its nav, trail and title (pageContext and
// routeContext in js/app/nav.js, the one pure implementation), derived from a router, and written onto the elements as plain attributes by the HOST. No element reads it:
// pk-side-nav, pk-page-header and pk-breadcrumb stay passive and attribute-driven. Loaded on demand by a standalone page; mountApp's entry never imports this file.
//
//   import { mountRouter } from './plainkit/js/router.js';
//   import { createPageContext, bindPageContext } from './plainkit/js/page-context.js';
//   const router = mountRouter(el, { routes });
//   const ctx = createPageContext({ router, routes, nav });   // nav (optional): [{ id, title, route, children? }], the entries that say which row is current
//   const unbind = bindPageContext(ctx, { nav: sideNav, header: pageHeader, breadcrumb, title: true });
//   ctx.set({ title: order.name });                           // data loaded after render: wins field by field until the next navigation
//
// A route's own override is its node's `context` ({ ids?, crumbs?, title? } or ({ path, params, query }) => object), as in a module's route tree.
import { pageContext, routeContext } from './app/nav.js';
import { navRoutes } from './route-tree.js';

export { pageContext };

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// { get(), subscribe(fn), set(override), destroy() }. get() is recomputed on every navigation and on set(); subscribe(fn) calls fn(context) after each change that alters it and
// returns the unsubscribe. A set() is forgotten at the next navigation (a new page starts from its URL and its route's `context`).
export function createPageContext({ router, routes = [], nav = [], override = {} } = {}) {
    const def = { routes }, tree = navRoutes(nav), listeners = new Set();
    let manual = {}, value = null, stop = null;
    const compute = () => {
        const cur = router?.current?.();
        if (!cur) return pageContext({ routes: [] }, [], '/', { ...override, ...manual });
        const route = { path: cur.url, params: cur.params, query: cur.query };
        return pageContext(def, tree, cur.url, { ...override, ...routeContext(def, route), ...manual });
    };
    const refresh = () => {
        const next = compute();
        if (value && same(value, next)) return;
        value = next;
        for (const fn of [...listeners]) fn(value);
    };
    value = compute();
    stop = router?.subscribe?.(() => { manual = {}; refresh(); }) ?? null;
    return {
        get: () => value,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        set(next = {}) { manual = { ...manual, ...next }; refresh(); },
        destroy() { stop?.(); stop = null; listeners.clear(); },
    };
}

// Rows of a pk-side-nav are matched by their `data-id` (the id in the nav tree): `current` on the last id, `expanded` on every ancestor; other rows keep what the reader opened.
function markRows(nav, ids) {
    const leaf = ids[ids.length - 1];
    for (const row of nav.querySelectorAll('pk-nav-item[data-id]')) {
        const id = row.getAttribute('data-id');
        row.toggleAttribute('current', id === leaf);
        if (id !== leaf && ids.includes(id)) row.setAttribute('expanded', '');
    }
}

// Writes the context onto the elements now and on every change: nav (a pk-side-nav: current and expanded rows), header (a pk-page-header: `crumbs` JSON and `heading`),
// breadcrumb (a pk-breadcrumb: its anchors, the last is the current page), title (true, or (title) => string: document.title). All optional. Returns the unsubscribe.
export function bindPageContext(ctx, { nav, header, breadcrumb, title } = {}) {
    const doc = (nav ?? header ?? breadcrumb)?.ownerDocument ?? globalThis.document;
    const apply = c => {
        if (nav) markRows(nav, c.ids);
        if (header) {
            header.setAttribute('crumbs', JSON.stringify(c.crumbs));
            if (c.title) header.setAttribute('heading', c.title); else header.removeAttribute('heading');
        }
        if (breadcrumb) {
            breadcrumb.replaceChildren(...c.crumbs.map(({ label, href }) => {
                const a = doc.createElement('a');
                a.textContent = label;
                if (href) a.setAttribute('href', href);
                return a;
            }));
        }
        if (title && c.title && doc) doc.title = typeof title === 'function' ? title(c.title) : c.title;
    };
    apply(ctx.get());
    return ctx.subscribe(apply);
}
