// Layout model, part 5 of 5: the pure editing operations (each returns a new document) and the undo history. See js/layout-model.js.

import { LIMITS, VOID, PRESERVE, CONTROL, ATTR_NAME, has, attrInfo, valueProblem, slotExists, isText, tidy, normalizeText, orderSlots, ModelError, problem, errorsOf } from './layout-schema.js';
import { assignIds, locate } from './layout-tree.js';
import { checkNode } from './layout-validate.js';

function rewrite(list, id, fn) {
    let changed = false;
    const out = [];
    for (const child of list) {
        if (isText(child)) { out.push(child); continue; }
        if (child.id === id) { changed = true; const r = fn(child); if (Array.isArray(r)) out.push(...r); else if (r !== null) out.push(r); continue; }
        let slotChanged = false;
        const slots = {};
        for (const [k, v] of Object.entries(child.slots)) { const nv = rewrite(v, id, fn); if (nv !== v) slotChanged = true; slots[k] = nv; }
        if (slotChanged) { changed = true; out.push({ ...child, slots: orderSlots(slots) }); } else out.push(child);
    }
    return changed ? out : list;
}
const update = (doc, id, fn) => {
    const nodes = rewrite(doc.nodes, id, fn);
    if (nodes === doc.nodes) throw new ModelError('not-found', `no node has the id ${id}`, []);
    return { ...doc, nodes };
};
const withSlot = (slots, name, list) => orderSlots({ ...slots, [name]: list });
const contains = (node, id) => { let found = false; const go = n => { if (n.id === id) found = true; for (const kids of Object.values(n.slots)) for (const k of kids) if (!isText(k) && !found) go(k); }; go(node); return found; };

const ancestorTags = (doc, id) => {
    const path = [];
    const go = (list, trail) => { for (const c of list) { if (isText(c)) continue; if (c.id === id) { path.push(...trail); return true; } if (Object.values(c.slots).some(k => go(k, [...trail, c.tag]))) return true; } return false; };
    go(doc.nodes, []);
    return path;
};

// Checks a subtree that is about to be placed under `parentNode` in `slot`; throws with the problems when it is not valid there.
function checkPlacement(doc, parentNode, slot, nodes, registry) {
    if (!registry) return;
    const problems = [];
    const ctx = { registry, problems, ids: new Set(), count: 0, seq: Number.MAX_SAFE_INTEGER };
    const parentEntry = parentNode ? registry.entry(parentNode.tag) : null;
    if (parentNode && !parentEntry) throw new ModelError('unknown-tag', `unknown element <${parentNode.tag}>`, []);
    if (parentEntry) {
        if (parentEntry.void) problems.push(problem('void-content', `<${parentNode.tag}> cannot have content`, { id: parentNode.id }));
        if (slot !== '' && (parentEntry.native || !slotExists(parentEntry, slot))) problems.push(problem('unknown-slot', `<${parentNode.tag}> has no slot "${slot}"`, { id: parentNode.id }));
    } else if (slot !== '') problems.push(problem('slot-parent', 'a top-level node has no slot'));
    const trail = parentNode ? [...ancestorTags(doc, parentNode.id), parentNode.tag] : [];
    for (const n of nodes) { if (isText(n)) { if (slot !== '') problems.push(problem('text-slot', 'text can only be in the default slot')); } else checkNode(n, parentNode, n.id ?? 'node', 1, ctx, false, trail); }
    const errors = errorsOf(problems);
    if (errors.length) throw new ModelError('invalid', errors[0].message, errors);
}

function resolveParent(doc, parent) {
    if (parent === null || parent === undefined) return null;
    const at = locate(doc, parent);
    if (!at) throw new ModelError('not-found', `no node has the id ${parent}`, []);
    return at.node;
}
const clampIndex = (index, length) => {
    if (index === undefined || index === null) return length;
    if (!Number.isInteger(index) || index < 0 || index > length) throw new ModelError('bad-index', `index ${index} is outside 0..${length}`, []);
    return index;
};
const listAt = (doc, parentNode, slot) => (parentNode ? parentNode.slots[slot] ?? [] : doc.nodes);

function place(doc, parentNode, slot, index, nodes) {
    const list = listAt(doc, parentNode, slot);
    const at = clampIndex(index, list.length);
    const next = [...list.slice(0, at), ...nodes, ...list.slice(at)];
    if (!parentNode) return { ...doc, nodes: next };
    return update(doc, parentNode.id, p => ({ ...p, slots: withSlot(p.slots, slot, next) }));
}

/** Insert a new node (a spec: { tag, props?, text?, children?, slots? }) under `parent` (an id; null for the top level) in `slot` at `index` (default: the end). Returns { doc, id }. */
export function insertNode(doc, { parent = null, slot = '', index, node }, registry) {
    const parentNode = resolveParent(doc, parent);
    const { doc: seqDoc, nodes } = assignIds(doc, [node]);
    checkPlacement(doc, parentNode, slot, nodes, registry);
    return { doc: place(seqDoc, parentNode, slot, index, nodes), id: nodes[0].id };
}

/** Move a node under `parent` in `slot`; `index` counts among the target's children once the node has been taken out. */
export function moveNode(doc, { id, parent = null, slot = '', index }, registry) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    if (parent !== null && parent !== undefined && contains(at.node, parent)) throw new ModelError('cycle', 'a node cannot move into itself', []);
    const removed = update(doc, id, () => null);
    const parentNode = resolveParent(removed, parent);
    checkPlacement(removed, parentNode, slot, [at.node], registry);
    return { doc: place(removed, parentNode, slot, index, [at.node]), id };
}

/** Remove a node and everything in it. */
export function removeNode(doc, { id }) {
    if (!locate(doc, id)) throw new ModelError('not-found', `no node has the id ${id}`, []);
    return { doc: update(doc, id, () => null), id };
}

const cloneWithIds = (node, seq) => (isText(node) ? node : { id: `n${seq.n++}`, tag: node.tag, props: { ...node.props }, slots: Object.fromEntries(Object.entries(node.slots).map(([k, v]) => [k, v.map(c => cloneWithIds(c, seq))])) });

/** Copy a node (with fresh ids) right after the original. Returns { doc, id } with the copy's id. */
export function duplicateNode(doc, { id }) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    const seq = { n: doc.seq };
    const copy = cloneWithIds(at.node, seq);
    return { doc: place({ ...doc, seq: seq.n }, at.parent, at.slot ?? '', at.index + 1, [copy]), id: copy.id };
}

/** Put a new element around a node: the wrapper takes the node's place (and slot) and holds it in its default slot. Returns { doc, id } with the wrapper's id. */
export function wrapNode(doc, { id, wrapper }, registry) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    const spec = typeof wrapper === 'string' ? { tag: wrapper } : wrapper;
    const { doc: seqDoc, nodes: [box] } = assignIds(doc, [spec]);
    const wrapped = { ...box, slots: orderSlots({ ...box.slots, '': [at.node, ...(box.slots[''] ?? [])] }) };
    checkPlacement(doc, at.parent, at.slot ?? '', [wrapped], registry);
    return { doc: update(seqDoc, id, () => wrapped), id: box.id };
}

/** Set (or, with false, null or undefined, remove) one attribute of a node. A number becomes its text. */
export function setProp(doc, { id, name, value }, registry) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    const next = { ...at.node.props };
    if (value === false || value === undefined || value === null) delete next[name];
    else next[name] = value === true ? true : String(value);
    if (registry) {
        const entry = registry.entry(at.node.tag);
        const errors = [];
        if (has(next, name)) {
            if (name === 'style' || (/^on/.test(name) && !entry?.props.has(name)) || name === 'slot' || !ATTR_NAME.test(name)) errors.push(problem('unknown-prop', `"${name}" cannot be set`, { id }));
            else {
                const info = entry && attrInfo(entry, name);
                if (!info) errors.push(problem('unknown-prop', `<${at.node.tag}> has no prop "${name}"`, { id }));
                else { const why = valueProblem(name, info, next[name]); if (why) errors.push(problem('bad-value', `<${at.node.tag}> ${name} ${why}`, { id })); }
            }
        }
        if (errors.length) throw new ModelError('invalid', errors[0].message, errors);
    }
    return { doc: update(doc, id, n => ({ ...n, props: next })), id };
}

/** Replace the text of a node: its text children become one canonical string (or none when empty); element children stay. */
export function setText(doc, { id, text }) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    if (VOID.has(at.node.tag)) throw new ModelError('void-content', `<${at.node.tag}> cannot have content`, []);
    const keep = PRESERVE.has(at.node.tag);
    const value = keep ? String(text ?? '') : normalizeText(text);
    if (value.length > LIMITS.text) throw new ModelError('text-long', `text is longer than ${LIMITS.text} characters`, []);
    if (CONTROL.test(value)) throw new ModelError('text-control', 'text contains a control character', []);
    const elements = (at.node.slots[''] ?? []).filter(c => !isText(c));
    const list = tidy([...(value ? [value] : []), ...elements], keep);
    return { doc: update(doc, id, n => ({ ...n, slots: withSlot(n.slots, '', list) })), id };
}

/** Move a node into another named slot of its parent (at the end). */
export function setSlot(doc, { id, slot }, registry) {
    const at = locate(doc, id);
    if (!at) throw new ModelError('not-found', `no node has the id ${id}`, []);
    if (!at.parent) throw new ModelError('slot-parent', 'a top-level node has no slot', []);
    return moveNode(doc, { id, parent: at.parent.id, slot, index: undefined }, registry);
}

// ---------------------------------------------------------------- history

/** A small command stack of document snapshots (documents are immutable, so a snapshot is a reference). push(next, key): pushes with the same key in a row
 *  replace each other's step (typing in one field is one undo). */
export function createHistory(initial, { limit = 200 } = {}) {
    let present = initial;
    let past = [];
    let future = [];
    let lastKey = null;
    return {
        get doc() { return present; },
        get canUndo() { return past.length > 0; },
        get canRedo() { return future.length > 0; },
        push(next, key = null) {
            if (next === present) return present;
            if (!(key !== null && key === lastKey)) { past.push(present); if (past.length > limit) past.shift(); }
            present = next; future = []; lastKey = key;
            return present;
        },
        undo() { if (!past.length) return present; future.push(present); present = past.pop(); lastKey = null; return present; },
        redo() { if (!future.length) return present; past.push(present); present = future.pop(); lastKey = null; return present; },
        reset(doc) { present = doc; past = []; future = []; lastKey = null; return present; },
        get size() { return past.length; },
    };
}
