// The Guides page's routing, as pure functions (no DOM), so a node test can import them.
// Addresses: #/ is the list, #/<guide> a guide, #/<guide>/<heading> a heading inside it. A bare #<heading> is an in-page link (the table of contents, a
// heading's permalink): the page scrolls to it and rewrites the address to #/<guide>/<heading>, so the address you copy is one that reloads to the same place.

export const routeHash = (id, frag) => `#/${id}${frag ? `/${frag}` : ''}`;

/** { kind: 'home' } | { kind: 'guide', id, frag } | { kind: 'missing', id } | { kind: 'anchor', id } for a location hash and the known guide ids. */
export function parseHash(hash, ids) {
    const h = hash.startsWith('#') ? hash.slice(1) : hash;
    if (h === '' || h === '/') return { kind: 'home' };
    const decode = s => { try { return decodeURIComponent(s); } catch { return s; } }; // a malformed %-escape is kept as typed, and then matches nothing
    if (!h.startsWith('/')) return { kind: 'anchor', id: decode(h) };
    const [id, frag] = h.slice(1).split('/').map(decode);
    return ids.includes(id) ? { kind: 'guide', id, frag: frag || null } : { kind: 'missing', id };
}

/** The guides before and after `id` in reading order (null at either end). */
export function neighbours(guides, id) {
    const at = guides.findIndex(g => g.id === id);
    return { prev: at > 0 ? guides[at - 1] : null, next: at >= 0 && at < guides.length - 1 ? guides[at + 1] : null, index: at };
}
