// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'doc' (#353): <pk-doc-page>; config: { items, search, home, level, idParam, anchorParam } as data, and the callbacks loadItem(id, ctx) -> { title, summary, html }
// and href(id, anchor, ctx) -> module-relative path, and optionally searchItems(query, ctx) -> { ids, status }. The item shown is the route param idParam (default 'id'), the heading to scroll to the route query
// anchorParam (default 'anchor'); with no id the home list shows. A same-page link (pk-navigate) goes through ctx.navigate(href(id, anchor)); the element never touches history.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'doc',
    summary: 'A documentation reader: an item list plus a content pane, search and anchors.',
    configKeys: ['items', 'search', 'home', 'level', 'idParam', 'anchorParam', 'loadItem', 'href', 'searchItems'],
    states: [],
    useWhen: 'Long-form content browsed from a list of topics, with anchors and search, like a docs site.',
};
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-doc-page');
    const { loadItem, href, searchItems, idParam = 'id', anchorParam = 'anchor', ...data } = config;
    data.id = data.id ?? ctx?.route?.params?.[idParam] ?? null;
    data.anchor = data.anchor ?? ctx?.route?.query?.[anchorParam] ?? null;
    el.config = data;
    if (loadItem) el.loadItem = id => loadItem(id, ctx);
    // The app's side nav is the item list (embedded): it is filtered here, in the page type, by the same search that fills the status line. Rows are told apart by their address.
    const rows = () => [...host.ownerDocument.querySelectorAll('#pk-nav pk-nav-item[href]:not([data-module])')];
    const only = ids => { const keep = ids && new Set(ids.map(id => el.href?.(id) ?? `#${id}`)); for (const n of rows()) n.hidden = !!keep && !keep.has(n.getAttribute('href')); };
    const clear = e => { if (!String(e.target.value ?? '').trim()) only(null); };
    if (searchItems) el.searchItems = q => { const r = searchItems(q, ctx); if (data.embedded) only(r?.ids); return r; };
    if (data.embedded) el.addEventListener('input', clear);
    if (href) el.href = (id, anchor) => { const p = href(id, anchor, ctx); return ctx?.href?.(p) ?? p; }; // the element's links are router addresses (#/module/path), navigate() takes the path
    const go = e => { if (href && ctx?.navigate) ctx.navigate(href(e.detail.id, e.detail.anchor, ctx), { replace: !!e.detail.replace }); };
    el.addEventListener('pk-navigate', go);
    host.append(el);
    return () => { el.removeEventListener('pk-navigate', go); el.removeEventListener('input', clear); if (data.embedded) only(null); el.remove(); };
};
