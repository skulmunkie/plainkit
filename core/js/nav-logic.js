// Plainkit side-nav logic: the filter box, arrow-key tree navigation, the icon-rail flyout and persisted state. Pure, so it can be
// tested without a DOM. The elements (<pk-side-nav>, <pk-nav-item>) call these.
//
// A nav is a flat list of entries { id, label, parent }, parent being the id of the branch it sits under (or null).

// Entries that stay visible for a filter query, and the branches to open so a match is not hidden inside a folded one. A branch stays
// visible when it or any descendant matches. An empty query shows everything and opens nothing.
export function filterNav(entries, query) {
    const q = query.trim().toLowerCase();
    const all = new Set(entries.map(e => e.id));
    if (!q) return { visible: all, open: new Set(), matches: new Set(all) };
    const byId = new Map(entries.map(e => [e.id, e]));
    const matches = new Set(entries.filter(e => e.label.toLowerCase().includes(q)).map(e => e.id));
    const visible = new Set(matches);
    const open = new Set();
    for (const id of matches) {
        for (let p = byId.get(id)?.parent; p; p = byId.get(p)?.parent) { visible.add(p); open.add(p); }
    }
    return { visible, open, matches };
}

// Wraps the matched text of a label for highlighting: [{ text, match }].
export function splitMatch(label, query) {
    const q = query.trim().toLowerCase();
    const at = q ? label.toLowerCase().indexOf(q) : -1;
    if (at < 0) return [{ text: label, match: false }];
    return [{ text: label.slice(0, at), match: false }, { text: label.slice(at, at + q.length), match: true }, { text: label.slice(at + q.length), match: false }].filter(r => r.text);
}

// What an arrow key does on a nav row. ctx: { expanded, hasChildren, isChild }. Returns 'next' | 'prev' | 'first' | 'last' | 'expand' |
// 'collapse' | 'focus-child' | 'focus-parent' | null. Right opens a folded branch, then steps into it; Left folds an open branch, or
// steps up from a child to its branch.
export function treeKey(key, { expanded = false, hasChildren = false, isChild = false } = {}) {
    switch (key) {
        case 'ArrowDown': return 'next';
        case 'ArrowUp': return 'prev';
        case 'Home': return 'first';
        case 'End': return 'last';
        case 'ArrowRight': return hasChildren ? (expanded ? 'focus-child' : 'expand') : null;
        case 'ArrowLeft': return hasChildren && expanded ? 'collapse' : isChild ? 'focus-parent' : null;
        default: return null;
    }
}

// Persisted state: the ids of open branches and whether the rail is collapsed, as a small JSON string that survives a bad read.
export const serializeNav = (openIds, collapsed) => JSON.stringify({ o: [...openIds].sort(), c: !!collapsed });

export function parseNav(text) {
    try {
        const v = JSON.parse(text);
        const open = Array.isArray(v?.o) ? v.o.filter(x => typeof x === 'string').slice(0, 200) : [];
        return { open, collapsed: v?.c === true };
    } catch {
        return { open: [], collapsed: false };
    }
}

// Active-route resolution: given a flat list of entries { id, href, parent } (href may be '' for a branch with no link of its own) and
// the host's current path, which entry is the active leaf and which ancestor branches should be open for it.
//
// Algorithm:
//   1. Normalize both the current path and every href: drop a query string or fragment, drop a trailing slash (but keep a lone '/').
//   2. Exact match first: an entry whose normalized href equals the normalized current path. If more than one entry shares that href
//      (not expected, but not enforced either), the one with more path segments wins — there is always at most one in practice.
//   3. Otherwise, fall back to the deepest segment-prefix match: an entry whose href's segments are a prefix of the current path's
//      segments (segment-by-segment, so '/users' matches '/users/42' but not '/users-archive' — a naive string prefix would get this
//      wrong). Among all such entries the one with the most segments wins, so '/users/settings' beats '/users' when the path is
//      '/users/settings/profile'. This fallback is what resolves a detail/record page ('/users/42') that is not itself a menu href.
//   4. The open set is every ancestor of the resolved entry (its parent, its parent's parent, …); everything else is meant to collapse.
// No match (empty tree, or a path outside it) returns { current: null, open: empty set }.
export function normalizeRoutePath(path) {
    if (!path) return '';
    const withoutQuery = String(path).split(/[?#]/)[0];
    return withoutQuery.length > 1 && withoutQuery.endsWith('/') ? withoutQuery.slice(0, -1) : withoutQuery;
}
const routeSegments = path => path.split('/').filter(Boolean);

export function resolveActiveRoute(entries, path) {
    const current = normalizeRoutePath(path);
    const currentSegments = routeSegments(current);
    const withHref = entries.filter(e => e.href);
    let best = null, bestLen = -1;
    for (const e of withHref) {
        const href = normalizeRoutePath(e.href);
        if (href !== current) continue;
        const len = routeSegments(href).length;
        if (len > bestLen) { best = e; bestLen = len; }
    }
    if (!best) {
        for (const e of withHref) {
            const hrefSegments = routeSegments(normalizeRoutePath(e.href));
            if (!hrefSegments.length || hrefSegments.length >= currentSegments.length) continue;
            if (hrefSegments.every((s, i) => s === currentSegments[i]) && hrefSegments.length > bestLen) { best = e; bestLen = hrefSegments.length; }
        }
    }
    const open = new Set();
    if (best) {
        const byId = new Map(entries.map(e => [e.id, e]));
        for (let p = best.parent; p; p = byId.get(p)?.parent) open.add(p);
    }
    return { current: best ? best.id : null, open };
}

// In the collapsed rail a branch opens as a flyout beside it (labels are hidden, so the rail row also needs a tooltip).
export const railFlyoutPlacement = 'right-start';
export const railRowTooltip = label => (label ?? '').trim();

// Below this width the nav is an off-canvas drawer instead of a column or a rail.
export const DRAWER_BREAKPOINT = 1024;
export const navMode = (width, collapsed) => (width <= DRAWER_BREAKPOINT ? 'drawer' : collapsed ? 'rail' : 'full');
