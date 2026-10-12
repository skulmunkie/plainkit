// Shared pieces of the dock-tree model (js/dock-model.js): the constants, the tree helpers and the default layout. Pure data, no DOM, no logging (issue 1108: split out to stay under the per-module budget).

export const VERSION = 1;
export const LIMITS = Object.freeze({ depth: 12, groups: 64, panels: 128, floaters: 16, bytes: 65536 });
export const ZONES = ['center', 'left', 'right', 'top', 'bottom'];
export const RECT = { minW: 120, minH: 80 };
export const ID = /^d[1-9]\d{0,8}$/;
export const PANEL = /^[a-z][\w-]{0,39}$/;
export const SIZE = { min: 5, max: 95 };

export const problem = (code, message, path = '') => ({ code, severity: 'warning', message, path });
export const same = (doc, p) => ({ doc, problems: [p] });
export const isSplit = n => n?.type === 'split';

export function walk(n, f) { if (n) { f(n); if (isSplit(n)) { walk(n.a, f); walk(n.b, f); } } }
export const groups = doc => { const g = []; walk(doc.root, n => { if (!isSplit(n)) g.push(n); }); return g; };
export const panelIds = doc => groups(doc).flatMap(g => g.panels);
export const findGroup = (doc, panel) => groups(doc).find(g => g.panels.includes(panel)) ?? null;
export const findNode = (doc, id) => { let f = null; walk(doc.root, n => { if (n.id === id) f = n; }); return f; };
export const depth = n => (isSplit(n) ? 1 + Math.max(depth(n.a), depth(n.b)) : 1);
export const floaters = doc => doc.floating ?? [];
export const findFloater = (doc, id) => floaters(doc).find(f => f.id === id) ?? null;
// Whether a group is a docked column at a screen edge: every horizontal-split ancestor keeps it in the branch nearest that edge, and it is actually
// inside at least one horizontal split (a vertical split is transparent to edge-ness — stacking a group above or below does not move it off a
// horizontal edge, but a group that is never beside another column, such as a full-width bottom bar, is not a "column" at all). Rail rendering
// (dock.js) only applies to an edge group; a group that is not one (the centre column, a bottom bar, or a column with something beside it on
// both sides) collapses to a header instead, per the design.
function edgeWalk(n, id, left, right, sawSplit) {
    if (!n) return null;
    if (n.id === id) return sawSplit ? { left, right } : { left: false, right: false };
    if (!isSplit(n)) return null;
    if (n.orientation === 'horizontal') return edgeWalk(n.a, id, left, false, true) ?? edgeWalk(n.b, id, false, right, true);
    return edgeWalk(n.a, id, left, right, sawSplit) ?? edgeWalk(n.b, id, left, right, sawSplit);
}
export const isEdgeGroup = (doc, id) => { const e = edgeWalk(doc.root, id, true, true, false); return Boolean(e && (e.left || e.right)); };
export const findFloaterGroup = (doc, panel) => floaters(doc).find(f => f.group.panels.includes(panel)) ?? null;
export const editFloater = (doc, id, fn) => floaters(doc).map(f => (f.id === id ? fn(f) : f));
export const nextFloaterZ = doc => floaters(doc).reduce((m, f) => Math.max(m, f.z), 0) + 1;
// Clamp a rect to a positive minimum size and, when bounds { w, h } are given, inside them (never rejected, always shrunk/moved to fit).
export function clampRect(r, bounds) {
    const w = Math.max(RECT.minW, Math.min(Number.isFinite(r.w) ? r.w : RECT.minW, bounds?.w ?? Infinity));
    const h = Math.max(RECT.minH, Math.min(Number.isFinite(r.h) ? r.h : RECT.minH, bounds?.h ?? Infinity));
    const maxX = bounds ? Math.max(0, bounds.w - w) : Infinity, maxY = bounds ? Math.max(0, bounds.h - h) : Infinity;
    const x = Math.max(0, Math.min(Number.isFinite(r.x) ? r.x : 0, maxX)), y = Math.max(0, Math.min(Number.isFinite(r.y) ? r.y : 0, maxY));
    return { x, y, w, h };
}

// Replace the node with this id by fn(node) (null removes it, and its parent split collapses into the surviving sibling). Untouched branches are shared.
export function edit(n, id, fn) {
    if (!n) return n;
    if (n.id === id) return fn(n);
    if (!isSplit(n)) return n;
    const a = edit(n.a, id, fn), b = edit(n.b, id, fn);
    if (a === n.a && b === n.b) return n;
    return a === null ? b : b === null ? a : { ...n, a, b };
}
export const next = (doc, root, seq = doc.seq) => ({ ...doc, seq, root });
export const tabs = (id, list, active = list[0]) => ({ id, type: 'tabs', active, panels: list });

export const emptyLayout = () => ({ version: VERSION, seq: 0, root: null, collapsed: [], floating: [] });

// The layout a consumer gets with no saved one. panels: [{ id, group? }]; group is left, center, right or bottom (anything else is center). Left | center | right
// become split(left, split(center, right)) and a bottom group is stacked under all of them; an empty side is left out.
export function defaultLayout(panels) {
    const by = g => panels.filter(p => (g === 'center' ? !['left', 'right', 'bottom'].includes(p.group) : p.group === g)).map(p => p.id);
    let seq = 0;
    const group = ids => (ids.length ? tabs(`d${++seq}`, ids) : null);
    const join = (a, b, orientation, size) => (a && b ? { id: `d${++seq}`, type: 'split', orientation, size, min: SIZE.min, max: SIZE.max, a, b } : a ?? b);
    const [l, c, r, b] = ['left', 'center', 'right', 'bottom'].map(g => group(by(g)));
    const row = join(l, join(c, r, 'horizontal', 75), 'horizontal', 20);
    const root = join(row, b, 'vertical', 75);
    return { version: VERSION, seq, root, collapsed: [], floating: [] };
}


// Take a panel out of its group (the group goes when it was the last one). Returns the new root.
export function lift(doc, panel) {
    const g = findGroup(doc, panel);
    return edit(doc.root, g.id, x => {
        const rest = x.panels.filter(p => p !== panel);
        return rest.length ? { ...x, panels: rest, active: x.active === panel ? rest[Math.min(x.panels.indexOf(panel), rest.length - 1)] : x.active } : null;
    });
}
