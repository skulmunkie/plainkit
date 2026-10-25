// SVG toolkit, alignment and distribution (#431, phase S4). Pure: no DOM, no side effects. Plans are data ([{ id, dx, dy }], document-space deltas,
// only the nodes that move), so an editor can preview them; applyPlan turns one into a single result (one undo step). Boxes are axis-aligned world
// bounds (bounds.js): a rotated node aligns by its outer box. Design: docs/superpowers/specs/2026-10-19-svg-toolkit-design.md, section 5.6.
//
//   alignPlan(doc, ids, { axis: 'x', to: 'start' })          left edges together ('center', 'end'; axis 'y': top, middle, bottom)
//   alignPlan(doc, ids, { axis: 'y', to: 'end', within: 'page' })   bottoms on the page's bottom edge (within 'selection' by default)
//   distributePlan(doc, ids, { axis: 'x', by: 'gap' })       equal gaps between 3 or more nodes ('center': equal centre distances); first and last stay
//   applyPlan(doc, plan)                                     { doc, changed, ids, problems, key: null }
// The selection is cleaned like ops.js: unknown ids, the root, nodes inside another selected node, and nodes that draw nothing are left out.

import { walk } from './model.js';
import { translate, invert } from './matrix.js';
import { parentMatrix, transform } from './ops.js';
import { worldBounds, union } from './bounds.js';

const AXES = { x: ['x', 'width'], y: ['y', 'height'] };
const delta = (axis, d) => ({ dx: axis === 'x' ? d : 0, dy: axis === 'y' ? d : 0 });

/** The selected nodes that can move, in document order: [{ id, box }]. */
export function movable(doc, ids, options = {}) {
    const want = new Set(Array.isArray(ids) ? ids : [ids]), out = [], inside = new Set();
    if (!doc?.root) return out;
    walk(doc.root, (n, parent) => {
        if (parent && inside.has(parent.id)) { inside.add(n.id); return false; }
        if (parent && want.has(n.id)) {
            inside.add(n.id);
            const box = worldBounds(doc, n.id, options);
            if (box) out.push({ id: n.id, box });
        }
        return false;
    });
    return out;
}

const edge = (box, [p, s], to) => box[p] + (to === 'center' ? box[s] / 2 : to === 'end' ? box[s] : 0);

export function alignPlan(doc, ids, { axis = 'x', to = 'start', within = 'selection', ...options } = {}) {
    const ax = AXES[axis];
    if (!ax || !['start', 'center', 'end'].includes(to)) return [];
    const items = movable(doc, ids, options);
    if (!items.length) return [];
    const frame = within === 'page' ? { x: 0, y: 0, width: doc.width, height: doc.height } : items.reduce((b, i) => union(b, i.box), null);
    const target = edge(frame, ax, to);
    return items.flatMap(({ id, box }) => { const d = target - edge(box, ax, to); return Math.abs(d) > 1e-9 ? [{ id, ...delta(axis, d) }] : []; });
}

export function distributePlan(doc, ids, { axis = 'x', by = 'gap', ...options } = {}) {
    const ax = AXES[axis];
    if (!ax || !['gap', 'center'].includes(by)) return [];
    const [p, s] = ax, items = movable(doc, ids, options), n = items.length;
    if (n < 3) return [];
    const mid = b => b[p] + b[s] / 2;
    items.sort((a, b) => (by === 'center' ? mid(a.box) - mid(b.box) : a.box[p] - b.box[p]));      // stable: ties keep document order
    const first = items[0].box, last = items[n - 1].box;
    const step = by === 'center' ? (mid(last) - mid(first)) / (n - 1) : (last[p] + last[s] - first[p] - items.reduce((t, i) => t + i.box[s], 0)) / (n - 1);
    let at = first[p];
    const plan = [];
    items.forEach((i, k) => {
        const want = by === 'center' ? mid(first) + k * step - i.box[s] / 2 : at;
        at += i.box[s] + step;
        const d = want - i.box[p];
        if (Math.abs(d) > 1e-9) plan.push({ id: i.id, ...delta(axis, d) });
    });
    return plan;
}

export function applyPlan(doc, plan) {
    let next = doc;
    const problems = [], moved = [];
    for (const m of Array.isArray(plan) ? plan : []) {
        if (!m || !Number.isFinite(m.dx) || !Number.isFinite(m.dy)) continue;
        const P = parentMatrix(next, m.id), back = P && invert(P), path = typeof m.id === 'string' ? m.id.slice(0, 20) : '(not an id)';
        if (!back) { problems.push({ code: P ? 'singular' : 'unknown-id', severity: 'warn', message: P ? `${path} sits in a group that flattens it; not moved.` : `No node ${path}; skipped.`, path }); continue; }
        const r = transform(next, [m.id], translate(back[0] * m.dx + back[2] * m.dy, back[1] * m.dx + back[3] * m.dy));
        problems.push(...r.problems);
        if (r.changed) { next = r.doc; moved.push(m.id); }
    }
    return { doc: next, changed: next !== doc, ids: moved, problems, key: null };
}
