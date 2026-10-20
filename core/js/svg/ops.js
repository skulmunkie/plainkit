// SVG toolkit, document operations (#431, phase S2). Pure: no DOM, no side effects, no logging. Every operation takes a document and returns a NEW one,
// sharing every untouched node with the old one (structural sharing, so an undo history holds references, not copies). Design:
// docs/superpowers/specs/2026-10-19-svg-toolkit-design.md, section 5.6 tier A.
//
//   let r = insert(doc, { type: 'rect', attrs: { x: 10, y: 10, width: 40, height: 20 } });   // { doc, changed, ids, problems, key }
//   r = group(r.doc, [r.ids[0], other]);   r = transform(r.doc, r.ids, translate(5, 0));   r = ungroup(r.doc, r.ids);
//   history = record(history, r.doc, { key: r.key, at: now });                                // js/history.js
//
// Every result is { doc, changed, ids, problems, key }:
//   doc      the new document; the very same object when nothing changed (history.record() then adds no step)
//   changed  false when the operation was refused or was a no-op
//   ids      the ids the operation produced or acted on (new node, new group, promoted children, moved nodes), in document order
//   problems { code, severity, message, path } like the model's; severity 'error' means the operation was refused as a whole
//   key      a history coalescing key for operations that repeat during a gesture (transform), else null
// Ids are never reused: a removed id is gone for good, and a new node takes the next number from the document's seq. A selection is cleaned first: unknown
// ids and the root are reported and skipped, duplicates collapse, and a node whose ancestor is also selected is acted on through that ancestor only (so a
// transform never applies twice). Results never break the model's limits; an operation that would is refused with an error problem.

import { LIMITS, NODES, createNode, locate, stats, walk } from './model.js';
import { cleanValue } from './allow.js';
import { IDENTITY, multiply, invert, isMatrix, isIdentity } from './matrix.js';

const has = Object.hasOwn;
const problem = (code, message, path = '', severity = 'warn') => ({ code, severity, message, path });
const done = (doc, next, ids, problems, key = null) => ({ doc: next, changed: next !== doc, ids, problems, key });
const refuse = (doc, code, message) => done(doc, doc, [], [problem(code, message, '', 'error')]);
const matrixOf = n => n.attrs.transform ?? IDENTITY;
const clampMatrix = m => cleanValue('matrix', m)[1];       // clamped to the coordinate limit; undefined for identity (meaning: no attribute)
// attributes in the allow-list's order, which is the model's canonical form (so validateDoc stays empty)
const withAttr = (type, attrs, name, v) => {
    const a = { ...attrs };
    if (v === undefined) delete a[name]; else a[name] = v;
    return Object.fromEntries(Object.keys(NODES[type]).filter(k => has(a, k)).map(k => [k, a[k]]));
};

/** Rebuilds `node`'s subtree. visit(child, parent) returns undefined to keep (and descend), null to remove, a node or a list of nodes to replace. */
function rebuild(node, visit) {
    if (!node.children) return node;
    let changed = false;
    const out = [];
    for (const c of node.children) {
        const r = visit(c, node);
        if (r === undefined) { const k = rebuild(c, visit); changed ||= k !== c; out.push(k); } else { changed = true; if (r) out.push(...[].concat(r)); }
    }
    return changed ? { ...node, children: out } : node;
}
/** Replaces the node `id` by fn(node), copying only the path to it. */
function edit(doc, id, fn) {
    const root = doc.root.id === id ? fn(doc.root) : rebuild(doc.root, c => (c.id === id ? fn(c) : undefined));
    return root === doc.root ? doc : { ...doc, root };
}
/** The cleaned selection: [{ node, parent }] in document order, plus the problems found. */
function pick(doc, ids, { root = false } = {}) {
    const want = new Set(Array.isArray(ids) ? ids : [ids]), problems = [], out = [], inside = new Set();
    walk(doc.root, (n, parent) => {
        if (parent && inside.has(parent.id)) { inside.add(n.id); want.delete(n.id); return false; }
        if (want.delete(n.id)) {
            if (!parent && !root) problems.push(problem('root', 'The root cannot be changed this way; skipped.', n.id));
            else { out.push({ node: n, parent }); inside.add(n.id); }
        }
        return false;
    });
    for (const id of want) if (!inside.has(id)) problems.push(problem('unknown-id', `No node ${label(id)}; skipped.`, label(id)));
    return { items: out, problems };
}
const label = id => (typeof id === 'string' ? id.slice(0, 20) : '(not an id)');
const inLimits = next => { const s = stats(next); return s.nodes <= LIMITS.nodes && s.depth <= LIMITS.depth; };
/** The product of the transforms of every ancestor of `id` including the parent (the matrix from the node's parent space to the document), or null. */
export function parentMatrix(doc, id) {
    const path = [];
    let found = false;
    walk(doc.root, (n, p, depth) => { path.length = depth - 1; if (n.id === id) { found = true; return true; } path.push(n); return false; });
    return found ? path.reduce((m, n) => multiply(m, matrixOf(n)), IDENTITY) : null;
}
const splice = (list, index, items) => { const at = Math.max(0, Math.min(list.length, Number.isInteger(index) ? index : list.length)); return [...list.slice(0, at), ...items, ...list.slice(at)]; };

// ---------------------------------------------------------------- insert, remove

/** Adds a new node built from `spec` (sanitised like any input, fresh ids for it and its descendants) to the group `parent` (default the root) at `index` (default last). */
export function insert(doc, spec, { parent = doc.root.id, index } = {}) {
    const into = locate(doc, parent)?.node;
    if (!into || into.type !== 'g') return refuse(doc, 'parent', 'The target must be an existing group.');
    const { doc: seeded, node, problems } = createNode(doc, spec);
    if (!node) return done(doc, doc, [], problems.length ? problems : [problem('node', 'Nothing to insert.', '', 'error')]);
    const next = edit(seeded, parent, p => ({ ...p, children: splice(p.children, index, [node]) }));
    return inLimits(next) ? done(doc, next, [node.id], problems) : refuse(doc, 'limit', 'The document would be larger or deeper than the limits.');
}

/** Removes the selected nodes with their descendants. */
export function remove(doc, ids) {
    const { items, problems } = pick(doc, ids);
    if (!items.length) return done(doc, doc, [], problems);
    const gone = new Set(items.map(i => i.node.id));
    const root = rebuild(doc.root, c => (gone.has(c.id) ? null : undefined));
    return done(doc, { ...doc, root }, items.map(i => i.node.id), problems);
}

// ---------------------------------------------------------------- move (reparent), group, ungroup, reorder

/**
 * Moves the selected nodes into the group `parent` at `index` (among that group's children once the moved ones are out; default last), keeping their order.
 * Unless `keepLook` is false each node's transform is adjusted so it stays where it is on the page, which needs the new parent's matrix to be invertible.
 */
export function move(doc, ids, { parent = doc.root.id, index, keepLook = true } = {}) {
    const target = locate(doc, parent)?.node;
    if (!target || target.type !== 'g') return refuse(doc, 'parent', 'The target must be an existing group.');
    const { items, problems } = pick(doc, ids);
    if (!items.length) return done(doc, doc, [], problems);
    const moving = new Set(items.map(i => i.node.id));
    let trapped = false;
    walk(doc.root, (n, p, d) => { if (moving.has(n.id)) { trapped = walk(n, m => m.id === parent); return true; } return false; });
    if (trapped) return refuse(doc, 'cycle', 'A group cannot be moved into itself.');
    const toWorld = keepLook ? multiply(parentMatrix(doc, parent) ?? IDENTITY, matrixOf(target)) : IDENTITY;
    const back = invert(toWorld);
    if (keepLook && !back) return refuse(doc, 'singular', 'The target group flattens its content; it cannot receive nodes without changing how they look.');
    const nodes = items.map(({ node, parent: from }) => {
        if (!keepLook || from.id === parent) return node;
        const m = clampMatrix(multiply(back, multiply(parentMatrix(doc, node.id), matrixOf(node))));
        return { ...node, attrs: withAttr(node.type, node.attrs, 'transform', m) };
    });
    const cut = rebuild(doc.root, c => (moving.has(c.id) ? null : undefined));
    const next = edit({ ...doc, root: cut }, parent, p => ({ ...p, children: splice(p.children, index, nodes) }));
    if (!inLimits(next)) return refuse(doc, 'limit', 'The document would be deeper than the limit.');
    return done(doc, JSON.stringify(next.root) === JSON.stringify(doc.root) ? doc : next, items.map(i => i.node.id), problems);
}

/** Wraps the selected nodes (which must share one parent) in a new group placed where the first of them was. */
export function group(doc, ids) {
    const { items, problems } = pick(doc, ids);
    if (!items.length) return done(doc, doc, [], problems);
    const from = items[0].parent;
    if (items.some(i => i.parent !== from)) return refuse(doc, 'group-parents', 'Only nodes that share one parent can be grouped.');
    const { doc: seeded, node: shell } = createNode(doc, { type: 'g', attrs: {} });
    const set = new Set(items.map(i => i.node.id)), g = { ...shell, children: items.map(i => i.node) };
    const next = edit(seeded, from.id, p => {
        const at = p.children.findIndex(c => set.has(c.id));
        return { ...p, children: splice(p.children.filter(c => !set.has(c.id)), at, [g]) };
    });
    return inLimits(next) ? done(doc, next, [g.id], problems) : refuse(doc, 'limit', 'The document would be deeper than the limit.');
}

const PUSH = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-rule'];
const LOST = ['class', 'title', 'aria-label', 'aria-hidden'];
/** Dissolves the selected groups into their parents. Each child gets the group's transform multiplied in and the inheritable look it did not set itself. */
export function ungroup(doc, ids) {
    const { items, problems } = pick(doc, ids);
    const groups = items.filter(i => i.node.type === 'g');
    for (const i of items) if (i.node.type !== 'g') problems.push(problem('not-group', `${i.node.id} is not a group; skipped.`, i.node.id));
    if (!groups.length) return done(doc, doc, [], problems);
    const out = [], by = new Map(groups.map(i => [i.node.id, i.node]));
    const root = rebuild(doc.root, c => {
        const g = by.get(c.id);
        if (!g) return undefined;
        const m = matrixOf(g), op = g.attrs.opacity ?? 1;
        if (op < 1 && g.children.length > 1) problems.push(problem('ungroup-opacity', `${g.id} was translucent as a whole; each child now carries that opacity alone, so overlaps look different.`, g.id));
        if (LOST.some(k => has(g.attrs, k))) problems.push(problem('ungroup-dropped', `${g.id} had a class, title or aria attribute; they went with the group.`, g.id));
        return g.children.map(k => {
            let attrs = k.attrs;
            for (const a of PUSH) if (has(g.attrs, a) && !has(attrs, a) && has(NODES[k.type], a)) attrs = withAttr(k.type, attrs, a, g.attrs[a]);
            if (op < 1) attrs = withAttr(k.type, attrs, 'opacity', (attrs.opacity ?? 1) * op);
            attrs = withAttr(k.type, attrs, 'transform', clampMatrix(multiply(m, matrixOf(k))));
            out.push(k.id);
            return { ...k, attrs };
        });
    });
    return done(doc, { ...doc, root }, out, problems);
}

/** Changes paint order (later children are drawn on top) inside each parent: 'front', 'back', 'forward' or 'backward' (one step). */
export function reorder(doc, ids, to) {
    if (!['front', 'back', 'forward', 'backward'].includes(to)) return refuse(doc, 'order', 'Order must be front, back, forward or backward.');
    const { items, problems } = pick(doc, ids);
    let next = doc;
    for (const parent of new Set(items.map(i => i.parent))) {
        const sel = new Set(items.filter(i => i.parent === parent).map(i => i.node.id));
        next = edit(next, parent.id, p => {
            const list = [...p.children], is = n => sel.has(n.id);
            if (to === 'front' || to === 'back') {
                const a = list.filter(is), b = list.filter(n => !is(n));
                list.splice(0, list.length, ...(to === 'front' ? [...b, ...a] : [...a, ...b]));
            } else if (to === 'forward') {
                for (let i = list.length - 2; i >= 0; i--) if (is(list[i]) && !is(list[i + 1])) [list[i], list[i + 1]] = [list[i + 1], list[i]];
            } else for (let i = 1; i < list.length; i++) if (is(list[i]) && !is(list[i - 1])) [list[i], list[i - 1]] = [list[i - 1], list[i]];
            return list.every((n, i) => n === p.children[i]) ? p : { ...p, children: list };
        });
    }
    return done(doc, next, items.map(i => i.node.id), problems);
}

// ---------------------------------------------------------------- transform, attributes

/**
 * Applies a matrix to the selected nodes. By default it acts in the parent's space (after the node's own transform, like moving it on the page); `local`
 * acts in the node's own space (before it). A matrix that flattens (not invertible) is refused. The key lets a drag be one undo step.
 */
export function transform(doc, ids, matrix, { local = false } = {}) {
    if (!isMatrix(matrix)) return refuse(doc, 'matrix', 'The transform must be six finite numbers.');
    if (!invert(matrix)) return refuse(doc, 'singular', 'A transform that flattens a shape cannot be undone; refused.');
    const { items, problems } = pick(doc, ids);
    if (!items.length) return done(doc, doc, [], problems);
    if (isIdentity(matrix)) return done(doc, doc, items.map(i => i.node.id), problems);
    const by = new Map(items.map(i => [i.node.id, i.node]));
    const root = rebuild(doc.root, c => {
        const n = by.get(c.id);
        return n && { ...n, attrs: withAttr(n.type, n.attrs, 'transform', clampMatrix(local ? multiply(matrixOf(n), matrix) : multiply(matrix, matrixOf(n)))) };
    });
    const found = items.map(i => i.node.id);
    return done(doc, { ...doc, root }, found, problems, 'svg-transform:' + found.join(','));
}

/** Sets attributes on one node; a null value removes one. Each value is checked against the allow-list kind of that attribute; a refused one is skipped and reported. */
export function setAttrs(doc, id, attrs) {
    const { items, problems } = pick(doc, id, { root: true });
    if (!items.length || typeof attrs !== 'object' || attrs === null) return done(doc, doc, [], problems);
    const { node } = items[0];
    let next = node.attrs;
    for (const [name, v] of Object.entries(attrs)) {
        if (!has(NODES[node.type], name)) { problems.push(problem('attr-unknown', `${name} is not allowed on ${node.type}; skipped.`, name)); continue; }
        const [ok, clean] = v === null ? [true, undefined] : cleanValue(NODES[node.type][name], v);
        if (!ok) problems.push(problem('attr-value', `${name} on ${node.type} has an invalid value; skipped.`, name));
        else if (JSON.stringify(next[name]) !== JSON.stringify(clean)) next = withAttr(node.type, next, name, clean);
    }
    return done(doc, next === node.attrs ? doc : edit(doc, node.id, n => ({ ...n, attrs: next })), [node.id], problems);
}
