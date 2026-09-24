// The route tree logic behind modules/router/router.js, pure so node tests and samples can use it without a DOM: match a path against
// a nested tree of { path, label, children?, crumb? } and derive the breadcrumb trail. A `:name` path segment captures; `label` is a
// string or (params) => string; `crumb: false` leaves a route out of the trail; static segments beat a :param at the same depth.

const segments = path => path.split(/[?#]/)[0].split('/').filter(Boolean);
export const labelOf = (node, params) => (typeof node.label === 'function' ? node.label(params) : node.label) ?? '';

// Every route with its ancestor chain, in declaration order. Pure.
export function flattenRoutes(routes, parents = []) {
    return routes.flatMap(node => {
        const chain = [...parents, node];
        return [{ node, chain }, ...flattenRoutes(node.children ?? [], chain)];
    });
}

// The route matching `path`: { node, chain, params } or null. Pure.
export function matchRoute(routes, path) {
    const want = segments(path);
    let best = null;
    for (const { node, chain } of flattenRoutes(routes)) {
        const have = segments(node.path);
        if (have.length !== want.length) continue;
        const params = {};
        let statics = 0;
        const ok = have.every((seg, i) => {
            if (seg[0] === ':') { params[seg.slice(1)] = decodeURIComponent(want[i]); return true; }
            statics++;
            return seg === want[i];
        });
        if (ok && (!best || statics > best.statics)) best = { node, chain, params, statics };
    }
    return best && { node: best.node, chain: best.chain, params: best.params };
}

// The path of a route with its :params filled in from `params`. Pure.
export function fillPath(path, params = {}) {
    return '/' + segments(path).map(s => (s[0] === ':' ? encodeURIComponent(params[s.slice(1)] ?? '') : s)).join('/');
}

// The breadcrumb trail for a match, [{ label, href? }] in the shape createPage's setBreadcrumbs takes: the last item is the current
// page and has no href. Pure.
export function buildCrumbs(match) {
    if (!match) return [];
    const items = match.chain.filter(n => n.crumb !== false)
        .map(n => ({ label: labelOf(n, match.params), href: fillPath(n.path, match.params) }));
    if (items.length) delete items[items.length - 1].href;
    return items;
}
