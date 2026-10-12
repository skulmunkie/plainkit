// The dock-tree model behind pk-dock: pure data and pure operations, no DOM and no logging (docs/superpowers/specs/2026-09-28-dockable-layout-design.md, issue 432).
// A layout is { version, seq, root, collapsed, floating }. root is a binary tree: a `split` (orientation, size percent, min, max, a, b: the props of
// pk-splitter) or a `tabs` group (an ordered list of panel ids and the active one). A panel is not a node: it is a declared id, held by exactly one group,
// in `root` or in one `floating` entry (a window-like overlay positioned inside the dock's own bounds: { id, x, y, w, h, z, group }, round 2 item 5).
// collapsed is the list of open panel ids folded to their header (a panel, not a group; see dock.js for why a tab group does not offer this yet).
// Every operation returns { doc, problems } and never mutates or throws on data: a request that cannot be applied returns the input unchanged plus a problem.
// Close/open and undo add their fields and operations in later steps (fromJson drops keys it does not know).
import { clampSize } from './size.js';
import { LIMITS, ZONES, SIZE, problem, same, isSplit, walk, depth, groups, findGroup, findNode, floaters, findFloaterGroup, editFloater, edit, next, tabs, lift, VERSION } from './dock-tree.js';

// The pieces split out for size (issue 1108) stay reachable from here, so every importer keeps working.
export { VERSION, LIMITS, ZONES, groups, panelIds, findGroup, findNode, floaters, findFloater, isEdgeGroup, emptyLayout, defaultLayout } from './dock-tree.js';
export { floatPanel, dockFloating, moveFloater, resizeFloater, dragFloater, floatDrag, raiseFloater } from './dock-float.js';
export { toJson, fromJson } from './dock-json.js';

// Every invariant of the spec that step 1 has, as a list of problems (empty = valid). declared = the panel ids that exist, when known.
export function validate(doc, declared = null) {
    const out = [], ids = new Set(), seen = new Set();
    if (!doc || doc.version !== VERSION || !Number.isInteger(doc.seq)) return [problem('shape', 'not a version 1 layout')];
    walk(doc.root, n => {
        if (ids.has(n.id)) out.push(problem('id-duplicate', `id ${n.id} twice`, n.id));
        ids.add(n.id);
        if (Number(String(n.id).slice(1)) > doc.seq) out.push(problem('seq', `seq is below ${n.id}`, n.id));
        if (isSplit(n)) {
            const lo = n.min ?? SIZE.min, hi = n.max ?? SIZE.max;
            if (!(Number.isFinite(n.size) && lo <= hi && n.size >= lo && n.size <= hi)) out.push(problem('size', `size of ${n.id} is outside [${lo}, ${hi}]`, n.id));
        } else {
            if (!n.panels.length) out.push(problem('empty-group', `group ${n.id} is empty`, n.id));
            if (!n.panels.includes(n.active)) out.push(problem('active', `active of ${n.id} is not a member`, n.id));
            for (const p of n.panels) { if (seen.has(p)) out.push(problem('panel-twice', `panel ${p} twice`, n.id)); seen.add(p); if (declared && !declared.includes(p)) out.push(problem('panel-unknown', `panel ${p} is not declared`, n.id)); }
        }
    });
    const collapsed = Array.isArray(doc.collapsed) ? doc.collapsed : null;
    if (!collapsed) out.push(problem('shape', 'collapsed is not an array'));
    else { const cs = new Set(); for (const p of collapsed) { if (cs.has(p)) out.push(problem('collapsed-twice', `panel ${p} twice in collapsed`, p)); cs.add(p); if (!seen.has(p)) out.push(problem('collapsed-unknown', `collapsed panel ${p} is not open`, p)); } }
    for (const f of floaters(doc)) {
        if (ids.has(f.id)) out.push(problem('id-duplicate', `id ${f.id} twice`, f.id));
        ids.add(f.id);
        if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !(f.w > 0) || !(f.h > 0)) out.push(problem('rect', `floater ${f.id} has a bad rect`, f.id));
        const g = f.group;
        if (!g || g.type !== 'tabs') { out.push(problem('shape', `floater ${f.id} has no group`, f.id)); continue; }
        if (ids.has(g.id)) out.push(problem('id-duplicate', `id ${g.id} twice`, g.id));
        ids.add(g.id);
        if (!g.panels.length) out.push(problem('empty-group', `group ${g.id} is empty`, g.id));
        if (!g.panels.includes(g.active)) out.push(problem('active', `active of ${g.id} is not a member`, g.id));
        for (const p of g.panels) { if (seen.has(p)) out.push(problem('panel-twice', `panel ${p} twice`, g.id)); seen.add(p); if (declared && !declared.includes(p)) out.push(problem('panel-unknown', `panel ${p} is not declared`, g.id)); }
    }
    if (declared) for (const p of declared) if (!seen.has(p)) out.push(problem('panel-missing', `panel ${p} is in no group`, p));
    if (depth(doc.root) - 1 > LIMITS.depth || ids.size > LIMITS.groups * 2 || seen.size > LIMITS.panels || floaters(doc).length > LIMITS.floaters) out.push(problem('limit', 'a limit is exceeded'));
    return out;
}

// Set a split's size (held to its min and max).
export function resize(doc, { split, size }) {
    const n = findNode(doc, split);
    if (!isSplit(n)) return same(doc, problem('unknown-split', `no split ${split}`, split));
    const s = clampSize(size, n.min ?? SIZE.min, n.max ?? SIZE.max);
    return s === n.size ? { doc, problems: [] } : { doc: next(doc, edit(doc.root, split, x => ({ ...x, size: s }))), problems: [] };
}

// Make a panel the active one of its group (root or floating).
export function activate(doc, { panel }) {
    const g = findGroup(doc, panel);
    if (g) return g.active === panel ? { doc, problems: [] } : { doc: next(doc, edit(doc.root, g.id, x => ({ ...x, active: panel }))), problems: [] };
    const f = findFloaterGroup(doc, panel);
    if (!f) return same(doc, problem('unknown-panel', `no panel ${panel}`, panel));
    return f.group.active === panel ? { doc, problems: [] } : { doc: { ...doc, floating: editFloater(doc, f.id, x => ({ ...x, group: { ...x.group, active: panel } })) }, problems: [] };
}


// Move a panel into a tab group at an index (the keyboard and menu form of a tab drag; also reorders inside a group). The panel becomes the group's active tab.
export function moveTab(doc, { panel, group, index = Infinity }) {
    const from = findGroup(doc, panel), to = findNode(doc, group);
    if (!from) return same(doc, problem('unknown-panel', `no panel ${panel}`, panel));
    if (!to || isSplit(to)) return same(doc, problem('unknown-group', `no group ${group}`, group));
    const others = to.panels.filter(p => p !== panel), at = Math.max(0, Math.min(Number.isFinite(index) ? index : others.length, others.length));
    const list = [...others.slice(0, at), panel, ...others.slice(at)];
    if (from === to && list.join() === to.panels.join() && to.active === panel) return { doc, problems: [] };
    const root = from === to ? doc.root : lift(doc, panel);
    return { doc: next(doc, edit(root, group, x => ({ ...x, panels: list, active: panel }))), problems: [] };
}

// Fold a panel to its header (a single-panel group only; see dock.js for why a tab group does not offer this yet). A no-op when already collapsed.
export function collapsePanel(doc, { panel }) {
    const g = findGroup(doc, panel);
    if (!g) return same(doc, problem('unknown-panel', `no panel ${panel}`, panel));
    const collapsed = doc.collapsed ?? [];
    return collapsed.includes(panel) ? { doc, problems: [] } : { doc: { ...doc, collapsed: [...collapsed, panel] }, problems: [] };
}

// Restore a collapsed panel's body. A no-op for a panel that is not collapsed (including one the model has never heard of).
export function expandPanel(doc, { panel }) {
    const collapsed = doc.collapsed ?? [];
    return collapsed.includes(panel) ? { doc: { ...doc, collapsed: collapsed.filter(p => p !== panel) }, problems: [] } : { doc, problems: [] };
}

// Dock a panel next to a group (zone left, right, top, bottom: the group becomes a split of a new group and the target) or into it (zone center).
export function dockPanel(doc, { panel, target, zone }) {
    const from = findGroup(doc, panel), to = findNode(doc, target);
    if (!from) return same(doc, problem('unknown-panel', `no panel ${panel}`, panel));
    if (!to || isSplit(to)) return same(doc, problem('unknown-group', `no group ${target}`, target));
    if (!ZONES.includes(zone)) return same(doc, problem('unknown-zone', `no zone ${zone}`, target));
    if (zone === 'center') return moveTab(doc, { panel, group: target });
    if (from === to && to.panels.length === 1) return same(doc, problem('self', 'a panel cannot be docked beside its own group', panel));
    const seq = doc.seq + 2, fresh = tabs(`d${doc.seq + 1}`, [panel]), before = zone === 'left' || zone === 'top';
    const root = edit(lift(doc, panel), target, x => ({ id: `d${seq}`, type: 'split', orientation: zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical', size: 50, min: SIZE.min, max: SIZE.max, a: before ? fresh : x, b: before ? x : fresh }));
    const out = next(doc, root, seq);
    return depth(root) - 1 > LIMITS.depth || groups(out).length > LIMITS.groups ? same(doc, problem('limit', 'the layout would be too deep or too large', target)) : { doc: out, problems: [] };
}

// The $drag state a pointer down on a tab-drag-to-dock handle starts (dock.js adds its own DOM `handle` reference on top).
export function tabDrag(panel, from, pointerId, sx, sy) {
    return { panel, from, target: null, zone: null, pointerId, moved: false, sx, sy };
}
// The live-region phrase for a completed moveTab/dockPanel (dock.js's applyMove); panelTitle/targetTitle are already resolved display names.
export function describeMove(kind, panelTitle, targetTitle, zone) {
    return kind === 'dock' ? `${panelTitle} docked ${zone === 'top' ? 'above' : zone === 'bottom' ? 'below' : zone + ' of'} ${targetTitle}` : `${panelTitle} added as a tab in ${targetTitle}`;
}
