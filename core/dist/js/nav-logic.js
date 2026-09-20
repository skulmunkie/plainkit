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

// In the collapsed rail a branch opens as a flyout beside it (labels are hidden, so the rail row also needs a tooltip).
export const railFlyoutPlacement = 'right-start';
export const railRowTooltip = label => (label ?? '').trim();

// Below this width the nav is an off-canvas drawer instead of a column or a rail.
export const DRAWER_BREAKPOINT = 1024;
export const navMode = (width, collapsed) => (width <= DRAWER_BREAKPOINT ? 'drawer' : collapsed ? 'rail' : 'full');
