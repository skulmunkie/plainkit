// The route tree logic behind modules/router/router.js, pure so node tests and samples can use it without a DOM: match a path against
// a nested tree of { path, label, children?, crumb? } and derive the breadcrumb trail. A `:name` path segment captures; `label` is a
// string or (params) => string; `crumb: false` leaves a route out of the trail; static segments beat a :param at the same depth. A route
// with path '*' is the not-found route: it matches only when nothing else does. A node with no path is a group (a nav heading): it
// is never matched but stays in the trail.
import { schemeOf } from './safe-url.js';

const segments = path => path.split(/[?#]/)[0].split('/').filter(Boolean);
export const labelOf = (node, params) => (typeof node.label === 'function' ? node.label(params) : node.label) ?? '';
// A malformed escape (%E0%A4%A) is data from the address bar, not an error: it stays as typed.
const dec = s => { try { return decodeURIComponent(s); } catch { return s; /* not valid percent-encoding: keep the text as typed */ } };

// Every route with its ancestor chain, in declaration order. Pure.
export function flattenRoutes(routes, parents = []) {
    return routes.flatMap(node => {
        const chain = [...parents, node];
        return [{ node, chain }, ...flattenRoutes(node.children ?? [], chain)];
    });
}

const flatCache = new WeakMap(); // the flattened tree per routes array: a route change does no tree walk
const flat = routes => flatCache.get(routes) ?? (flatCache.set(routes, flattenRoutes(routes)), flatCache.get(routes));

// The route matching `path`: { node, chain, params } or null; a '*' route answers an unmatched path (notFound: true). Pure.
export function matchRoute(routes, path) {
    const want = segments(path);
    let best = null, star = null;
    for (const { node, chain } of flat(routes)) {
        if (node.path == null) continue;
        if (node.path === '*') { star ??= { node, chain, params: {}, notFound: true }; continue; }
        const have = segments(node.path);
        if (have.length !== want.length) continue;
        const params = {};
        let statics = 0;
        const ok = have.every((seg, i) => {
            if (seg[0] === ':') { params[seg.slice(1)] = dec(want[i]); return true; }
            statics++;
            return seg === want[i];
        });
        if (ok && (!best || statics > best.statics)) best = { node, chain, params, statics };
    }
    return best ? { node: best.node, chain: best.chain, params: best.params } : star;
}

// The path of a route with its :params filled in from `params`. Pure.
export function fillPath(path, params = {}) {
    return '/' + segments(path).map(s => (s[0] === ':' ? encodeURIComponent(params[s.slice(1)] ?? '') : s)).join('/');
}

// The breadcrumb trail for a match, [{ label, href? }] in the shape createPage's setBreadcrumbs takes: the last item is the current
// page and has no href (nor does a group). Pure.
export function buildCrumbs(match) {
    if (!match) return [];
    const items = match.chain.filter(n => n.crumb !== false)
        .map(n => (n.path == null || n.path === '*' ? { label: labelOf(n, match.params) } : { label: labelOf(n, match.params), href: fillPath(n.path, match.params) }));
    if (items.length) delete items[items.length - 1].href;
    return items;
}

// A nav tree ({ id, title, route?, children? } items, the shape pk-side-nav is built from) as a route tree, so one tree gives the
// links, `current` and the trail. Pure.
export const navRoutes = nav => nav.map(n => ({ path: n.route, label: n.title, crumb: n.crumb, children: navRoutes(n.children ?? []) }));

// The breadcrumb trail of `path` through a nav tree: the ancestor titles down to the item whose route it is; [] when the nav has no such route. Pure.
export function buildNavCrumbs(nav, path) {
    const match = matchRoute(navRoutes(nav), path);
    return match && !match.notFound ? buildCrumbs(match) : [];
}

const norm = p => '/' + segments(p ?? '').join('/'); // the path as written, no :param filling

// ---- hash addresses: #/<path>?<query> (the query lives inside the hash, so a path-mode server never sees it) ----

// An address the app may navigate or redirect to: a same-app path ('/x', '/x?a=1'), never another site, a script address, a scheme-relative
// '//host', a backslash or a control character. The address itself, or null. Pure.
export const safeRoute = to => (typeof to === 'string' && /^\/(?![/\\])/.test(to) && !/[\x00-\x1f\x7f\\]/.test(to) && schemeOf(to) === null ? to : null);

// '#/orders/7?tab=x' to { path: '/orders/7', query: { tab: 'x' } }. The legacy form '#a=1&b=2' (no leading slash) is a query on '/'. Pure.
export function parseHash(hash) {
    const body = String(hash ?? '').replace(/^#/, '');
    const legacy = body !== '' && body[0] !== '/';
    const [p, ...q] = (legacy ? '?' + body : body).split('?');
    return { path: norm(p), query: Object.fromEntries(new URLSearchParams(q.join('?'))), legacy };
}

// The hash for a path and a query object: '#/orders/7?tab=x'. Pure.
export function buildHash(path, query = {}) {
    const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null)).toString();
    return '#' + norm(path) + (q ? '?' + q : '');
}

// Old address to new. `aliases` maps a path pattern ('/elements/:name') to its new path ('/gallery/elements/:name', :params carried over) or to
// a function (path, query, params) => new address | null; the query is kept for a string target. Returns the new address ('/x?a=1') or null when
// no alias applies; the caller accepts it only through safeRoute. Pure.
export function mapAlias(aliases, path, query = {}) {
    for (const [from, to] of Object.entries(aliases ?? {})) {
        const m = matchRoute([{ path: from }], path);
        if (!m) continue;
        const target = typeof to === 'function' ? to(path, query, m.params) : fillPath(to, m.params);
        if (target == null) continue;
        const q = new URLSearchParams(Object.entries(query)).toString();
        return typeof to === 'function' || !q ? target : target + '?' + q;
    }
    return null;
}
