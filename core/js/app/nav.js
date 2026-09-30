// A module's side nav for mountApp (#350): its nav tree becomes pk-nav-item rows inside the app's one pk-side-nav, and the same tree, with the module's route tree, gives the
// current row, the breadcrumb trail and the default search results. DOM APIs and textContent only (item titles are the module's data, never markup); attributes only on the rows
// (they may not be upgraded yet: no property is set on an element that may not be defined).
//
// NAV ENTRIES ARE STRUCTURE. A nav is an array of { id, title, route | href, icon?, badge?, children? }, or (ctx) => array: a small, stable set of destinations per module
// ("All orders", "Open", "Shipped"), never one entry per record. A collection of records belongs in a LIST PAGE whose rows link to a record route ('/orders/:id'); the record
// route sits under its list's route in the module's route tree, so the list's nav entry stays current for it and the breadcrumbs read App > Module > Order 8.
// A nav over MAX_TOP entries at the top or MAX_ALL in total is logged once with that advice. `route` is module-relative ('/open'), `href` an http(s), mailto, tel or relative
// address. Nothing here runs a module's code except the nav function itself, and a throw in it is logged and shows no nav.
import { flattenRoutes, matchRoute, buildCrumbs, fillPath, labelOf } from '../route-tree.js';
import { safeHref } from '../safe-url.js';
import { createLogger } from '../log.js';

export const MAX_TOP = 12;
export const MAX_ALL = 40;
const log = createLogger('app');
const told = new Set();
const h = (doc, tag, attrs = {}, text) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text != null) el.textContent = text;
    return el;
};
const total = items => items.reduce((n, i) => n + 1 + total(i.children ?? []), 0);

// The module's nav tree, or [] (a module without `nav`, or one whose function threw).
export function navOf(def, ctx) {
    let nav = [];
    try {
        nav = typeof def.nav === 'function' ? def.nav(ctx) : def.nav;
    } catch (e) {
        log.error(`the nav of "${def.id}" threw, no menu is shown`, e);
    }
    if (!Array.isArray(nav)) return [];
    if ((nav.length > MAX_TOP || total(nav) > MAX_ALL) && !told.has(def.id)) {
        told.add(def.id);
        log.warn(`the nav of "${def.id}" has ${nav.length} top-level and ${total(nav)} entries: nav entries are structure (a few stable destinations), a collection of records belongs in a list page`);
    }
    return nav;
}

// The module's nav with its links built: every route becomes an address through `hrefOf(route)` (module-relative to app-wide), the rest is kept. Pure.
export const absolute = (items, hrefOf) => items.map(it => ({ id: it.id, title: it.title, icon: it.icon, badge: it.badge, href: it.route != null ? hrefOf(it.route) : it.href, children: absolute(it.children ?? [], hrefOf) }));

// The ONE menu tree both layouts render: the modules, each { id, title, icon, module, href, active, children } where the active module holds its own entries (`shown`, see
// absolute). The rendering layer decides what it looks like: paintNav (a pk-side-nav tree) and paintLinks (bar links) below.
export const menuTree = (modules, hrefOf, active, shown) => modules.filter(m => !m.menu).map(m => ({
    id: `module:${m.id}`, title: m.title, icon: m.icon, module: m.id, href: hrefOf(`/${m.id}`), active: m.id === active, children: m.id === active ? shown : [],
}));

// Renders groups of items into `into` (a pk-side-nav): [{ heading?, items }], a heading being a group title row. Returns the Map id -> row. An item is { id, title, href, icon?, badge?,
// children?, module?, active? }; a module section that holds entries is a branch (no link, open), a module without is a link and current when active.
export function paintNav(doc, into, groups) {
    const rows = new Map();
    const build = (item, slot) => {
        const kids = item.children ?? [], section = item.module && kids.length;
        const row = h(doc, 'pk-nav-item');
        const href = section ? null : safeHref(item.href);
        if (href) row.setAttribute('href', href);
        if (slot) row.setAttribute('slot', slot);
        if (item.module) row.setAttribute('data-module', item.module);
        if (section) row.setAttribute('expanded', ''); else if (item.active) row.setAttribute('current', '');
        if (item.icon) row.append(h(doc, 'pk-icon', { slot: 'icon', name: item.icon }));
        row.append(doc.createTextNode(item.title));
        if (item.badge != null) row.append(h(doc, 'span', { slot: 'badge' }, String(item.badge)));
        for (const child of kids) row.append(build(child, 'children'));
        rows.set(item.id, row);
        return row;
    };
    into.replaceChildren(...groups.flatMap(g => [...(g.heading ? [h(doc, 'pk-nav-item', { group: '' }, g.heading)] : []), ...g.items.map(item => build(item))]));
    return rows;
}

// Top layout: the modules as links in the bar (aria-current on the active one).
export const paintLinks = (doc, tree) => tree.map(it => {
    const a = h(doc, 'a', { href: it.href, 'data-module': it.module }, it.title);
    if (it.active) a.setAttribute('aria-current', 'page');
    return a;
});

// Where `path` is: `tree` is navRoutes(nav), built once per module. The module's route tree says which nav entry the page belongs to (the deepest route on the way to it
// that is a nav entry: a record route sits under its list) and what comes after it in the trail (route labels). Returns the ids from the entry's top ancestor down to the
// entry (the last is the current row) and the trail with module-relative hrefs, the last without one. Pure.
export function locate(def, tree, path) {
    const m = matchRoute(def.routes ?? [], path), chain = m && !m.notFound ? m.chain : [], params = m?.params ?? {};
    const entries = flattenRoutes(tree).filter(x => x.node.path != null);
    const trail = nodes => nodes.filter(n => n.label != null && n.crumb !== false).map(n => ({ label: labelOf(n, params), href: fillPath(n.path, params) }));
    const strip = list => (list.length ? [...list.slice(0, -1), { label: list[list.length - 1].label }] : list);
    for (let i = chain.length - 1; i >= 0; i--) {
        const hit = entries.find(x => x.node.path === chain[i].path);
        if (!hit) continue;
        const own = buildCrumbs({ chain: hit.chain, params }).map((c, k, all) => (k === all.length - 1 ? { ...c, href: fillPath(hit.node.path, params) } : c));
        return { ids: hit.chain.map(n => n.id), crumbs: strip([...own, ...trail(chain.slice(i + 1))]) };
    }
    const direct = matchRoute(tree, path);
    if (direct && !direct.notFound) return { ids: direct.chain.map(n => n.id), crumbs: buildCrumbs(direct) };
    return { ids: [], crumbs: strip(trail(chain)) };
}

// THE PAGE CONTEXT (#670): one answer to "where is the reader", read by the side nav (ids: the current row and the branches to open), the breadcrumb (crumbs) and the page
// header / document title (title, the last crumb). Zero-config default: locate() above, from the URL and the route tree. An explicit `override` ({ ids?, crumbs?, title? }, each
// optional) wins field by field when the URL alone cannot say (data-driven menus); a title alone also replaces the last crumb's label, so the header and the trail never disagree.
export function pageContext(def, tree, path, override = {}) {
    const base = locate(def, tree, path);
    const ids = Array.isArray(override.ids) ? override.ids : base.ids;
    let crumbs = Array.isArray(override.crumbs) ? override.crumbs : base.crumbs;
    if (typeof override.title === 'string' && !Array.isArray(override.crumbs) && crumbs.length) crumbs = [...crumbs.slice(0, -1), { ...crumbs[crumbs.length - 1], label: override.title }];
    const title = typeof override.title === 'string' ? override.title : crumbs.length ? crumbs[crumbs.length - 1].label : '';
    return { ids, section: ids[0] ?? null, current: ids[ids.length - 1] ?? null, crumbs, title };
}

// The row of the current page is `current`, every ancestor branch is opened; other rows keep whatever the reader opened. The module rows are not the module's own entries.
export function markCurrent(rows, ids) {
    const leaf = ids[ids.length - 1];
    for (const [id, row] of rows) {
        if (row.hasAttribute('data-module')) continue;
        row.toggleAttribute('current', id === leaf);
        if (ids.includes(id) && id !== leaf) row.setAttribute('expanded', '');
    }
}

// The default search results: nav items whose title contains the query, at most `limit`, as pk-app-bar-search items ({ id, label, sub }) plus the route to go to.
export function searchNav(nav, query, limit = 8) {
    const q = String(query ?? '').trim().toLowerCase();
    const out = [];
    const walk = (items, parent) => {
        for (const it of items) {
            if (out.length >= limit) return;
            if (it.route != null && it.title.toLowerCase().includes(q)) out.push({ id: it.id, label: it.title, sub: parent, route: it.route });
            walk(it.children ?? [], it.title);
        }
    };
    if (q) walk(nav, '');
    return out;
}
