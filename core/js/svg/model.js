// SVG toolkit, the document model (#431, phase S1). A pure vector document: no DOM, no side effects, no logging. Everything returns data (documents and
// problem lists), so node tests cover it and any host can use it. Design: docs/superpowers/specs/2026-10-19-svg-toolkit-design.md.
//
//   let doc = createSvgDoc({ width: 200, height: 100, units: 'mm', title: 'Sign' });
//   const { doc: next, node } = createNode(doc, { type: 'rect', attrs: { x: 10, y: 10, width: 40, height: 20, fill: '#c00' } });   // allocates ids; not inserted (ops, S2)
//   const text = toJson(next);  const { doc: again, problems } = fromJson(text);                                                     // again equals next
//
// A document is { version, seq, width, height, units, title, desc, root }; a node is { id, type, attrs, children? } (children only on 'g'; 'text' nodes carry
// `text`). Ids are "s<number>" from the document's seq counter and never reused. Transforms are 6-number matrices (matrix.js). Paths are parsed absolute
// segments [['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y], ['Z']]. What may exist is the allow-list in allow.js.
//
// Guarantees (tested): fromJson(toJson(doc)) equals doc; fromJson never throws and always returns a document that passes validateDoc with no problems,
// whatever the input; limits (allow.js LIMITS) hold at every entry point; callers can tighten the limits but never loosen them.

import { LIMITS, UNITS, NODES, cleanValue, cleanText } from './allow.js';

export { LIMITS, UNITS, NODE_TYPES, NODES, isPaint } from './allow.js';
export const MODEL_VERSION = 1;

const ID = /^s([1-9]\d{0,8})$/;
const has = Object.hasOwn;
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const problem = (code, message, path, severity = 'warn') => ({ code, severity, message, path });

/** A fresh, valid document with an empty root group (id s1). */
export function createSvgDoc({ width = 100, height = 100, units = 'px', title = '', desc = '' } = {}) {
    return normalizeDoc({ version: MODEL_VERSION, seq: 1, width, height, units, title, desc, root: { id: 's1', type: 'g', attrs: {}, children: [] } }).doc;
}

// ---------------------------------------------------------------- the one sanitising pass

/**
 * Copies `raw` (anything, usually parsed JSON) into a canonical, valid document, listing what was refused or repaired in problems. Never throws; the copy
 * shares nothing with the input. `limits` may only tighten LIMITS.
 */
export function normalizeDoc(raw, limits = {}) {
    const problems = [];
    const L = Object.fromEntries(Object.entries(LIMITS).map(([k, v]) => [k, Math.min(v, Number.isFinite(limits?.[k]) ? limits[k] : v)]));
    const r = plain(raw) ? raw : {};
    if (!plain(raw)) problems.push(problem('document', 'The document is not an object; an empty one was used.', '', 'error'));
    if (r.version !== undefined && r.version !== MODEL_VERSION) problems.push(problem('version', `Model version ${String(r.version).slice(0, 20)} is not ${MODEL_VERSION}; read as ${MODEL_VERSION}.`, 'version'));
    const size = (key, path) => {
        const v = r[key];
        if (Number.isFinite(v) && v > 0) return Math.min(v, L.coord);
        problems.push(problem('doc-size', `${key} must be a positive number; 100 was used.`, path));
        return 100;
    };
    const text = (key, max) => {
        if (r[key] === undefined || r[key] === '') return '';
        if (typeof r[key] !== 'string') { problems.push(problem('doc-text', `${key} must be text.`, key)); return ''; }
        const [t, changed] = cleanText(r[key], max);
        if (changed) problems.push(problem('doc-text', `${key} was cleaned or shortened.`, key));
        return t;
    };
    const width = size('width', 'width'), height = size('height', 'height');
    let units = r.units ?? 'px';
    if (!UNITS.includes(units)) { problems.push(problem('units', 'Units must be one of ' + UNITS.join(', ') + '; px was used.', 'units')); units = 'px'; }
    const title = text('title', L.label), desc = text('desc', L.text);

    let count = 0, maxId = 0;
    const seen = new Set();
    const pending = [];     // nodes that need an id, in document order
    const nodeOf = (n, depth, path) => {
        if (!plain(n)) { problems.push(problem('node', 'A node is not an object; dropped.', path)); return null; }
        if (typeof n.type !== 'string' || !has(NODES, n.type)) { problems.push(problem('node-type', `Node type "${String(n.type).slice(0, 30)}" is not allowed; dropped with its children.`, path)); return null; }
        if (depth > L.depth) { problems.push(problem('limit-depth', `Nesting is deeper than ${L.depth}; dropped.`, path)); return null; }
        if (count >= L.nodes) { if (count === L.nodes) { count++; problems.push(problem('limit-nodes', `More than ${L.nodes} nodes; the rest were dropped.`, path)); } return null; }
        count++;
        const out = { id: '', type: n.type, attrs: {} };
        const m = typeof n.id === 'string' ? ID.exec(n.id) : null;
        if (m && !seen.has(n.id)) { out.id = n.id; seen.add(n.id); maxId = Math.max(maxId, Number(m[1])); } else pending.push(out);
        const given = plain(n.attrs) ? n.attrs : {};
        for (const [name, kind] of Object.entries(NODES[n.type])) {
            if (!has(given, name)) continue;
            const [ok, v] = cleanValue(kind, given[name], L);
            if (!ok) problems.push(problem('attr-value', `${name} on ${n.type} has an invalid value; dropped.`, `${path}.attrs.${name}`));
            else if (v !== undefined) out.attrs[name] = v;
        }
        for (const name of Object.keys(given)) if (!has(NODES[n.type], name)) problems.push(problem('attr-unknown', `${name} is not allowed on ${n.type}; dropped.`, `${path}.attrs.${name}`));
        if (n.type === 'text') {
            const [t, changed] = cleanText(typeof n.text === 'string' ? n.text : '', L.text);
            out.text = t;
            if (n.text !== undefined && (typeof n.text !== 'string' || changed)) problems.push(problem('text', 'Text was invalid or too long; cleaned.', `${path}.text`));
        } else if (n.text !== undefined) problems.push(problem('text', `${n.type} cannot hold text; dropped.`, `${path}.text`));
        if (n.type === 'g') {
            out.children = [];
            if (n.children !== undefined && !Array.isArray(n.children)) problems.push(problem('children', 'children must be a list; dropped.', `${path}.children`));
            else (n.children ?? []).forEach((c, i) => { const k = nodeOf(c, depth + 1, `${path}.children[${i}]`); if (k) out.children.push(k); });
        } else if (n.children !== undefined) problems.push(problem('children', `${n.type} cannot have children; dropped.`, `${path}.children`));
        return out;
    };
    let root = plain(r.root) && r.root.type === 'g' ? nodeOf(r.root, 1, 'root') : null;
    if (!root) {
        if (r.root !== undefined) problems.push(problem('root', 'The root must be a group; an empty one was used.', 'root', 'error'));
        root = { id: '', type: 'g', attrs: {}, children: [] };
        pending.unshift(root);
    }
    let seq = Math.max(maxId, Number.isInteger(r.seq) && r.seq > 0 ? Math.min(r.seq, 999999999) : 0);
    for (const n of pending) { if (seq >= 999999999) break; n.id = 's' + ++seq; }
    return { doc: { version: MODEL_VERSION, seq, width, height, units, title, desc, root }, problems };
}

/** The problems normalizeDoc finds in `doc`; an empty list means the document is valid and canonical. */
export function validateDoc(doc, limits = {}) {
    const { doc: clean, problems } = normalizeDoc(doc, limits);
    if (!problems.length && !equalDocs(doc, clean)) problems.push(problem('canonical', 'The document is valid but not in canonical form.', ''));
    return problems;
}

// ---------------------------------------------------------------- JSON, ids and nodes

export const toJson = doc => JSON.stringify(doc);

/** Reads a document from JSON text (or an already-parsed value). Never throws; on unusable input returns an empty document and an error problem. */
export function fromJson(input, { limits = {} } = {}) {
    let value = input;
    if (typeof input === 'string') {
        if (input.length > Math.min(LIMITS.input, limits.input ?? LIMITS.input)) return { doc: createSvgDoc(), problems: [problem('input-size', 'The input is larger than the limit.', '', 'error')] };
        try { value = JSON.parse(input); } catch { return { doc: createSvgDoc(), problems: [problem('json', 'The input is not valid JSON.', '', 'error')] }; }
    }
    return normalizeDoc(value, limits);
}

/**
 * Builds a node from a spec { type, attrs, children, text } with fresh ids from the document's counter (the node and its descendants), sanitised like any
 * input. Returns { doc, node, problems }: the document only has a larger seq; inserting the node is an operation (phase S2).
 */
export function createNode(doc, spec, limits = {}) {
    const { doc: probe, problems } = normalizeDoc({ ...doc, root: { id: doc.root.id, type: 'g', attrs: {}, children: [stripIds(spec)] } }, limits);
    const node = probe.root.children[0] ?? null;
    return { doc: node ? { ...doc, seq: probe.seq } : doc, node, problems };
}
function stripIds(n) {
    if (!plain(n)) return n;
    return { ...n, id: undefined, children: Array.isArray(n.children) ? n.children.map(stripIds) : n.children };
}

/** Depth-first, parents before children: fn(node, parent, depth) with the root at depth 1. A true return stops the walk and is returned. */
export function walk(node, fn, parent = null, depth = 1) {
    if (fn(node, parent, depth)) return true;
    return (node.children ?? []).some(c => walk(c, fn, node, depth + 1));
}
export function locate(doc, id) {
    let found = null;
    walk(doc.root, (n, parent) => (n.id === id ? (found = { node: n, parent, index: parent ? parent.children.indexOf(n) : 0 }) : false));
    return found;
}
export const findNode = (doc, id) => locate(doc, id)?.node ?? null;
export function stats(doc) {
    let nodes = 0, depth = 0;
    walk(doc.root, (n, p, d) => { nodes++; depth = Math.max(depth, d); });
    return { nodes, depth };
}
export const ids = doc => { const out = []; walk(doc.root, n => { out.push(n.id); }); return out; };
export const equalDocs = (a, b) => toJson(a) === toJson(b);
