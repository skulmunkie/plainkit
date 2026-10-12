// Floating-panel operations of the dock-tree model (js/dock-model.js re-exports them). Pure data, no DOM, no logging (issue 1108).
import { LIMITS, ZONES, SIZE, problem, same, isSplit, depth, groups, findGroup, findNode, floaters, findFloater, editFloater, nextFloaterZ, clampRect, edit, next, tabs, lift } from './dock-tree.js';

// Take a panel out of its tab group into a new floater (a window-like overlay inside the dock's own bounds, never over the page, per the design's decision
// "floating layer: inside the dock bounds only"). rect: { x, y, w, h }, clamped to a positive minimum and, when bounds { w, h } (the dock's own size) are
// given, inside them. The group the panel left may collapse away, same as any other lift.
export function floatPanel(doc, { panel, rect = {}, bounds } = {}) {
    const g = findGroup(doc, panel);
    if (!g) return same(doc, problem('unknown-panel', `no panel ${panel}`, panel));
    if (floaters(doc).length >= LIMITS.floaters) return same(doc, problem('limit', 'too many floating panels', panel));
    const seq = doc.seq + 2;
    const floater = { id: `d${seq - 1}`, ...clampRect(rect, bounds), z: nextFloaterZ(doc), group: tabs(`d${seq}`, [panel]) };
    return { doc: { ...next(doc, lift(doc, panel), seq), floating: [...floaters(doc), floater] }, problems: [] };
}

// Dock a whole floater's group back into the tree, next to a group (zone left/right/top/bottom, as dockPanel) or into it (zone center, its panels join
// the target's tabs). The floater's group node is reused as-is so a multi-panel floater keeps its tabs and active panel.
export function dockFloating(doc, { floater, target, zone } = {}) {
    const f = findFloater(doc, floater);
    const to = findNode(doc, target);
    if (!f) return same(doc, problem('unknown-floater', `no floater ${floater}`, floater));
    if (!to || isSplit(to)) return same(doc, problem('unknown-group', `no group ${target}`, target));
    if (!ZONES.includes(zone)) return same(doc, problem('unknown-zone', `no zone ${zone}`, target));
    const rest = floaters(doc).filter(x => x.id !== floater);
    if (zone === 'center') {
        const others = to.panels.filter(p => !f.group.panels.includes(p));
        const root = edit(doc.root, target, x => ({ ...x, panels: [...others, ...f.group.panels], active: f.group.active }));
        return { doc: { ...next(doc, root), floating: rest }, problems: [] };
    }
    const before = zone === 'left' || zone === 'top', seq = doc.seq + 1;
    const root = edit(doc.root, target, x => ({ id: `d${seq}`, type: 'split', orientation: zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical', size: 50, min: SIZE.min, max: SIZE.max, a: before ? f.group : x, b: before ? x : f.group }));
    const out = { ...next(doc, root, seq), floating: rest };
    return depth(root) - 1 > LIMITS.depth || groups(out).length > LIMITS.groups ? same(doc, problem('limit', 'the layout would be too deep or too large', target)) : { doc: out, problems: [] };
}

// Move or resize a floater's rect (clamped to bounds when given). raiseFloater brings it to the front (the highest z).
export function moveFloater(doc, { floater, x, y, bounds } = {}) {
    const f = findFloater(doc, floater);
    if (!f) return same(doc, problem('unknown-floater', `no floater ${floater}`, floater));
    const rect = clampRect({ ...f, x, y }, bounds);
    return { doc: { ...doc, floating: editFloater(doc, floater, n => ({ ...n, ...rect })) }, problems: [] };
}
export function resizeFloater(doc, { floater, w, h, bounds } = {}) {
    const f = findFloater(doc, floater);
    if (!f) return same(doc, problem('unknown-floater', `no floater ${floater}`, floater));
    const rect = clampRect({ ...f, w, h }, bounds);
    return { doc: { ...doc, floating: editFloater(doc, floater, n => ({ ...n, ...rect })) }, problems: [] };
}
// A pointer-drag delta applied to a floater's rect at the moment the drag started (start: { x, y, w, h }): resize widens/heightens it by (dx, dy),
// otherwise it moves by (dx, dy). Both go through moveFloater/resizeFloater, so the clamp is the one clampRect already has (a dock.js title-bar
// or resize-handle drag never re-derives that math itself, round 2 item 5, #618).
export function dragFloater(doc, { floater, start, dx = 0, dy = 0, resize, bounds } = {}) {
    return resize ? resizeFloater(doc, { floater, w: start.w + dx, h: start.h + dy, bounds }) : moveFloater(doc, { floater, x: start.x + dx, y: start.y + dy, bounds });
}
// The $drag state a pointer down on a floater's move handle or resize grip starts (dock.js adds its own DOM `handle` reference on top): f's own
// rect at grab time is the `start` dragFloater above wants back on every subsequent move.
export function floatDrag(f, resize, pointerId, sx, sy) {
    return { float: true, resize, id: f.id, pointerId, sx, sy, x: f.x, y: f.y, w: f.w, h: f.h };
}
export function raiseFloater(doc, { floater } = {}) {
    const f = findFloater(doc, floater);
    if (!f) return same(doc, problem('unknown-floater', `no floater ${floater}`, floater));
    const maxZ = floaters(doc).reduce((m, x) => Math.max(m, x.z), 0);
    return f.z === maxZ ? { doc, problems: [] } : { doc: { ...doc, floating: editFloater(doc, floater, n => ({ ...n, z: maxZ + 1 })) }, problems: [] };
}
