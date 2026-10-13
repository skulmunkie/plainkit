// What a surface dashboard remembers (#494, step 5), loaded with pages/dashboard-modules.js:
//   the active tab goes in the address (?tab=, replaceState: no history entry and no route change, so the page is not rebuilt; a reload or a shared link opens on it);
//   the filter selections go in the owning module's `state` when its defaults name the filter key (persist: ['range'], js/store.js).
// The key `dashboard:<surface>` is reserved for a later customisable layout (spec question 5) and unused here.

const writeTab = (win, id) => {
    const url = new URL(win.location.href);
    if (url.hash.startsWith('#/')) { const [path, q = ''] = url.hash.slice(1).split('?'), p = new URLSearchParams(q); p.set('tab', id); url.hash = `${path}?${p}`; } else url.searchParams.set('tab', id);
    win.history.replaceState(win.history.state, '', url);
};

// What to start from: the tab the address names (when the route has it) and the saved value of each filter the module's state knows.
export function restore(ctx, config, tabs) {
    const keys = (config.filters ?? []).map(f => f.key).filter(k => ctx.store?.get(k) !== undefined);
    const wanted = ctx.route?.query?.tab;
    return { keys, tab: tabs?.some(t => t.id === wanted) ? wanted : undefined, values: Object.fromEntries(keys.map(k => [k, ctx.store.get(k)])) };
}

// Wires the element: a tab change writes the address, a filter change writes the module's state.
export function wire(host, ctx, { keys, tab }, el, tabs) {
    let at = tab ?? tabs?.[0]?.id;
    el.onTab = id => { if (id !== at) { at = id; writeTab(host.ownerDocument.defaultView, id); } };
    if (keys.length) el.addEventListener('pk-value-change', () => ctx.store.patch(Object.fromEntries(keys.map(k => [k, el.context?.[k] ?? '']))));
}
