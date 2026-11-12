// The view of a pk-data-table in the address (urlState, #1946), loaded only when urlState is set. Names (the public contract): q search, sort column key,
// desc (1) for a descending sort, page, f.<key> a filter (a list value repeats the key); a prefix puts "<prefix>." before each. Defaults are omitted, other
// parameters and the hash are kept, and history.replaceState adds no entry (as tab-param does). The page size is a preference, not a view: never written.
const name = (p, n) => (p ? `${p}.${n}` : n);

/** The query parameters of `search` that belong to the list with `prefix`, as a partial query ({} when none). Pure. */
export function readQuery(search, prefix) {
    const params = new URLSearchParams(search), out = {}, fp = name(prefix, 'f.'), page = Number(params.get(name(prefix, 'page')));
    if (params.has(name(prefix, 'q'))) out.search = params.get(name(prefix, 'q'));
    if (params.get(name(prefix, 'sort'))) { out.sort = params.get(name(prefix, 'sort')); out.sortDir = params.has(name(prefix, 'desc')) ? 'descending' : 'ascending'; }
    if (page >= 1) out.page = Math.trunc(page);
    for (const k of new Set(params.keys())) if (k.startsWith(fp) && k.length > fp.length) { const v = params.getAll(k); (out.filters ??= {})[k.slice(fp.length)] = v.length > 1 ? v : v[0]; }
    return out;
}

/** `url` with the list's parameters replaced by those of query `q` (defaults `def` = { sort, sortDir } omitted). Pure; returns a new URL. */
export function writeQuery(url, prefix, q, def) {
    const u = new URL(url), fp = name(prefix, 'f.');
    for (const k of [...new Set(u.searchParams.keys())]) if (k.startsWith(fp) || ['q', 'sort', 'desc', 'page'].some(n => k === name(prefix, n))) u.searchParams.delete(k);
    if (q.search) u.searchParams.set(name(prefix, 'q'), q.search);
    if (q.sort && (q.sort !== def.sort || q.sortDir !== def.sortDir)) { u.searchParams.set(name(prefix, 'sort'), q.sort); if (q.sortDir === 'descending') u.searchParams.set(name(prefix, 'desc'), '1'); }
    if (q.page > 1) u.searchParams.set(name(prefix, 'page'), String(q.page));
    for (const [k, v] of Object.entries(q.filters ?? {})) for (const x of [].concat(v ?? '')) if (String(x).trim() !== '') u.searchParams.append(fp + k, x);
    return u;
}

/** Called by the element before each load: the first call seeds its query and controls from the address (the address wins over the initial values), later calls write it. */
export function sync(el) {
    const win = el.ownerDocument.defaultView, prefix = el.urlState || '';
    if (!el.$ur) {
        el.$ur = 1;
        const got = readQuery(win.location.search, prefix);
        if (Object.keys(got).length) { el.$query = { ...el.query, ...got, filters: { ...el.query.filters, ...got.filters } }; el.$touched = true; el.part('filters').value = el.$query.search; el.$seed = el.opt('search'); el.seedFilters(); }
        return;
    }
    const u = writeQuery(win.location.href, prefix, el.query, { sort: el.opt('sort') || null, sortDir: el.opt('sortDir') });
    win.history.replaceState(win.history.state, '', u);
    el.emit('pk-url-change', { url: u.pathname + u.search + u.hash }, { cancelable: false });
}
