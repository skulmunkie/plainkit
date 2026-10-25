// SVG toolkit, bounds (#431, phase S2). Pure: no DOM, no side effects. A box is { x, y, width, height } in document units (y down), the geometric
// bounds without stroke width (like getBBox). Exact for every node type under any affine transform: corners for rect, line and points, the exact
// extent of a transformed ellipse, the curve extrema of a transformed path, the union through the matrices for a group. Text has no font metrics
// here: its box is an estimate (0.6 em per character, 1 em high, by text-anchor) unless the caller passes `text(node)`, which returns the box in the
// node's own space (a browser can measure it with getBBox). Design: docs/superpowers/specs/2026-10-19-svg-toolkit-design.md, sections 5.2 and 8.
//
//   worldBounds(doc, 's4')               the box of s4 in document space (all ancestor transforms and its own applied), or null
//   orientedBox(doc, 's4')               { corners: [[x, y] x 4], matrix }: s4's own-space box turned into document space (for a rotated selection frame)
//   selectionBounds(doc, ['s4', 's7'])  the union of their world boxes (unknown ids skipped), or null
//   nodeBounds(node, m)                  the box of a node drawn under m (m maps the node's PARENT space; the node's own transform is applied inside)

import { IDENTITY, multiply, apply } from './matrix.js';
import { bounds as pathBounds, transform as pathTransform } from './path-geom.js';

const own = n => n.attrs?.transform ?? IDENTITY;
const num = v => (Number.isFinite(v) ? v : 0);
const cache = new WeakMap();      // node -> its box in its parent's space (no text callback): nodes never change, so this never goes stale

/** The smallest box holding both (either may be null). */
export function union(a, b) {
    if (!a || !b) return a || b || null;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
function ofPoints(m, pts) {
    let box = null;
    for (let k = 0; k + 1 < pts.length; k += 2) { const [x, y] = apply(m, pts[k], pts[k + 1]); box = union(box, { x, y, width: 0, height: 0 }); }
    return box;
}
/** The estimated box of a text node in its own space, or null when it has no text. */
export function textBox(n) {
    const t = typeof n.text === 'string' ? n.text : '';
    if (!t) return null;
    const a = n.attrs ?? {}, fs = a['font-size'] > 0 ? a['font-size'] : 16, w = 0.6 * fs * t.length;
    const x = num(a.x) - (a['text-anchor'] === 'middle' ? w / 2 : a['text-anchor'] === 'end' ? w : 0);
    return { x, y: num(a.y) - 0.8 * fs, width: w, height: fs };
}
const corners = b => [b.x, b.y, b.x + b.width, b.y, b.x + b.width, b.y + b.height, b.x, b.y + b.height];

/** The box of `n` (its own transform included) under `m`; options.text(node) measures text in the node's own space. Null when it draws nothing. */
export function nodeBounds(n, m = IDENTITY, options = {}) {
    if (!n || typeof n !== 'object') return null;
    const w = multiply(m, own(n)), a = n.attrs ?? {};
    switch (n.type) {
        case 'rect': return ofPoints(w, corners({ x: num(a.x), y: num(a.y), width: num(a.width), height: num(a.height) }));
        case 'line': return ofPoints(w, [num(a.x1), num(a.y1), num(a.x2), num(a.y2)]);
        case 'polyline': case 'polygon': return Array.isArray(a.points) ? ofPoints(w, a.points) : null;
        case 'path': return Array.isArray(a.d) ? pathBounds(pathTransform(a.d, w)) : null;
        case 'ellipse': {
            const [cx, cy] = apply(w, num(a.cx), num(a.cy)), rx = num(a.rx), ry = num(a.ry);
            const hx = Math.hypot(w[0] * rx, w[2] * ry), hy = Math.hypot(w[1] * rx, w[3] * ry);
            return { x: cx - hx, y: cy - hy, width: 2 * hx, height: 2 * hy };
        }
        case 'text': { const b = typeof options.text === 'function' ? options.text(n) : textBox(n); return b ? ofPoints(w, corners(b)) : null; }
        case 'g': return (n.children ?? []).reduce((box, c) => union(box, nodeBounds(c, w, options)), null);
        default: return null;
    }
}

// The box of a node in its parent's space, cached by node object when no text callback is given.
function parentBox(n, options) {
    if (typeof options.text === 'function') return nodeBounds(n, IDENTITY, options);
    if (!cache.has(n)) cache.set(n, nodeBounds(n));
    return cache.get(n);
}
const axisAligned = m => m[1] === 0 && m[2] === 0;

/** { node, m } where m maps the node's parent space to the document, or null for an unknown id. */
function find(doc, id) {
    let out = null;
    const visit = (n, m) => {
        if (n.id === id) { out = { node: n, m }; return true; }
        const w = multiply(m, own(n));
        return (n.children ?? []).some(c => visit(c, w));
    };
    if (doc?.root) visit(doc.root, IDENTITY);
    return out;
}

/** The box of node `id` in document space, or null (unknown id, or it draws nothing). */
export function worldBounds(doc, id, options = {}) {
    const f = find(doc, id);
    if (!f) return null;
    if (!axisAligned(f.m)) return nodeBounds(f.node, f.m, options);           // a rotation or skew above: the exact box, not a turned box
    const b = parentBox(f.node, options);
    return b && ofPoints(f.m, corners(b));
}

/** The node's own-space box (its own transform excluded) with its four corners in document space and the matrix that maps them, or null. */
export function orientedBox(doc, id, options = {}) {
    const f = find(doc, id);
    if (!f) return null;
    const b = nodeBounds({ ...f.node, attrs: { ...f.node.attrs, transform: undefined } }, IDENTITY, options);
    if (!b) return null;
    const matrix = multiply(f.m, own(f.node)), c = corners(b), out = [];
    for (let k = 0; k < 8; k += 2) out.push(apply(matrix, c[k], c[k + 1]));
    return { corners: out, matrix };
}

/** The union of the world boxes of `ids` (unknown ids and empty nodes are skipped), or null. */
export function selectionBounds(doc, ids, options = {}) {
    return [...new Set(Array.isArray(ids) ? ids : [ids])].reduce((box, id) => union(box, worldBounds(doc, id, options)), null);
}
