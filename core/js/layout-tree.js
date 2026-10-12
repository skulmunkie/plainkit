// Layout model, part 2 of 5: building nodes from specs (fresh ids), walking and finding nodes, comparing documents. See js/layout-model.js.

import { isText, tidy, orderSlots, ModelError, PRESERVE } from './layout-schema.js';

const propsFrom = raw => {
    const props = {};
    for (const [k, v] of Object.entries(raw ?? {})) {
        if (v === false || v === undefined || v === null) continue;
        props[k] = v === true ? true : typeof v === 'number' ? String(v) : String(v);
    }
    return props;
};

// A spec is { tag, props?, slots?, children?, text? } (or a string of text); it becomes nodes with fresh ids from the seq object. `children` and `text` are
// shorthand for the default slot. Text is normalised.
export function build(spec, seq, preserve = false) {
    if (isText(spec)) return spec;
    if (!spec || typeof spec !== 'object' || typeof spec.tag !== 'string') throw new ModelError('bad-node', 'a node needs a tag', []);
    const slots = {};
    for (const [name, kids] of Object.entries(spec.slots ?? {})) slots[name] = [...kids];
    if (spec.children) slots[''] = [...(slots[''] ?? []), ...spec.children];
    if (spec.text !== undefined && spec.text !== null && spec.text !== '') slots[''] = [String(spec.text), ...(slots[''] ?? [])];
    const id = `n${seq.n++}`;
    const keep = preserve || PRESERVE.has(spec.tag);
    const ordered = {};
    for (const [name, kids] of Object.entries(orderSlots(slots))) {
        const built = kids.map(k => build(k, seq, keep));
        const list = name === '' ? tidy(built, keep) : built;
        if (list.length) ordered[name] = list;
    }
    return { id, tag: spec.tag, props: propsFrom(spec.props), slots: orderSlots(ordered) };
}

/** Nodes for one or several specs with fresh ids: { doc, nodes } where doc has the advanced seq counter. */
export function assignIds(doc, specs) {
    const seq = { n: doc.seq };
    const nodes = specs.map(s => build(s, seq));
    return { doc: { ...doc, seq: seq.n }, nodes };
}

/** Visit every node in document order: fn(node, { parent, slot, index, depth }). Return false to skip the node's children. */
export function walk(doc, fn) {
    const go = (list, parent, slotName, depth) => {
        list.forEach((child, index) => {
            if (isText(child)) return;
            if (fn(child, { parent, slot: slotName, index, depth }) === false) return;
            for (const [s, kids] of Object.entries(child.slots)) go(kids, child, s, depth + 1);
        });
    };
    go(doc.nodes, null, null, 0);
}

/** { node, parent, slot, index, depth } of the node with this id, or null. */
export function locate(doc, id) {
    let found = null;
    walk(doc, (node, at) => { if (found) return false; if (node.id === id) { found = { node, ...at }; return false; } return undefined; });
    return found;
}

export const findNode = (doc, id) => locate(doc, id)?.node ?? null;

/** Every node in document order. */
export function flatten(doc) { const out = []; walk(doc, n => { out.push(n); }); return out; }

/** The document without ids and the seq counter: what two documents must share to be "the same page". */
export function stripIds(doc) {
    const strip = c => (isText(c) ? c : { tag: c.tag, props: c.props, slots: Object.fromEntries(Object.entries(c.slots).map(([k, v]) => [k, v.map(strip)])) });
    return { version: doc.version, nodes: doc.nodes.map(strip) };
}
export const equalDocs = (a, b, { ids = false } = {}) => (ids ? JSON.stringify({ ...a, seq: 0 }) === JSON.stringify({ ...b, seq: 0 }) : JSON.stringify(stripIds(a)) === JSON.stringify(stripIds(b)));
