// The default header search, loaded on the first query with no module `search` (js/app/app.js, #494 offset: moved out of nav.js to keep the entry graph small).
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
