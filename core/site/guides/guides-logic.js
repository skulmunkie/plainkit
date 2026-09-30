// The Guides page's routing helpers, as pure functions (no DOM) so a node test can import them. Matching a hash address, following
// hashchange and old-address redirects are the generic router's job now (js/router.js, js/route-tree.js: page.js mounts it in hash mode).
// What is left here is specific to guides: the address a guide or heading builds, reading order, and telling a route address
// ('#/<guide>' or '#/<guide>/<heading>') apart from a bare in-page anchor ('#<heading>', the table of contents or a heading's permalink),
// which stays page-local and never goes through the router (see page.js's comment on why).

export const routeHash = (id, frag) => `#/${id}${frag ? `/${frag}` : ''}`;

// True for a hash that names an in-page anchor rather than a route address: anything after '#' that does not start with '/'
// ('#install', not '#/theming' or '#/theming/install'). '', '#' and '#/' (the guide list) are not anchors.
export const isAnchorHash = hash => hash.length > 1 && hash[1] !== '/';

/** The guides before and after `id` in reading order (null at either end). */
export function neighbours(guides, id) {
    const at = guides.findIndex(g => g.id === id);
    return { prev: at > 0 ? guides[at - 1] : null, next: at >= 0 && at < guides.length - 1 ? guides[at + 1] : null, index: at };
}
