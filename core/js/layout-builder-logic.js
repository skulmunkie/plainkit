// Pure logic behind the layout builder module (modules/layout-builder): what the palette lists, where a new element goes, what the arrow and Alt+arrow keys do,
// and which fields the inspector shows for an element. No DOM, so node tests cover it. The document model is js/layout-model.js.

import { flatten, locate, findNode, kebab } from './layout-model.js';

const isText = c => typeof c === 'string';

// ---------------------------------------------------------------- palette

// The native content tags the palette offers next to the pk-* elements (headings, text, links, lists): { tag, title, summary, seed }.
export const NATIVE_PALETTE = [
    { tag: 'h2', title: 'Heading', summary: 'A section heading.', seed: { text: 'Heading' } },
    { tag: 'p', title: 'Paragraph', summary: 'A paragraph of text.', seed: { text: 'Paragraph text' } },
    { tag: 'a', title: 'Link', summary: 'A link to a page or an address.', seed: { props: { href: '#' }, text: 'Link' } },
    { tag: 'ul', title: 'List', summary: 'A bulleted list.', seed: { children: [{ tag: 'li', text: 'Item' }] } },
    { tag: 'div', title: 'Block', summary: 'A plain block to group content.', seed: {} },
    { tag: 'span', title: 'Text run', summary: 'An inline run of text.', seed: { text: 'Text' } },
    { tag: 'strong', title: 'Strong', summary: 'Important text.', seed: { text: 'Strong' } },
    { tag: 'hr', title: 'Divider line', summary: 'A horizontal rule.', seed: {} },
];
export const NATIVE_GROUP = 'Content';

/** The palette: groups of { tag, title, summary } in the order the gallery lists them (native content first), filtered by a search text over tag, title, summary and group. */
export function paletteGroups(api, query = '') {
    const q = String(query).trim().toLowerCase();
    const match = (...parts) => !q || parts.some(p => String(p ?? '').toLowerCase().includes(q));
    const groups = new Map();
    const add = (group, item) => { if (!groups.has(group)) groups.set(group, []); groups.get(group).push(item); };
    for (const n of NATIVE_PALETTE) if (match(n.tag, n.title, n.summary, NATIVE_GROUP)) add(NATIVE_GROUP, { tag: n.tag, title: n.title, summary: n.summary });
    for (const e of api) if (match(e.tag, e.title, e.summary, e.group)) add(e.group || 'Other', { tag: e.tag, title: e.title ?? e.tag, summary: e.summary ?? '' });
    return [...groups].map(([group, items]) => ({ group, items }));
}

const CONTAINER_GROUPS = new Set(['Layout', 'Layout & structure', 'Containers', 'Form layout', 'Navigation', 'Overlays']);

/** What a freshly inserted element starts with, so it shows something: a heading or label when it has one, text when it is a text-like element, nothing for containers. */
export function seedSpec(tag, meta) {
    const native = NATIVE_PALETTE.find(n => n.tag === tag);
    if (native) return { tag, ...structuredClone(native.seed) };
    if (!meta) return { tag };
    const has = name => meta.props?.some(p => p.name === name);
    const title = meta.title ?? tag;
    if (has('heading')) return { tag, props: { heading: title } };
    if (has('label')) return { tag, props: { label: title } };
    const takesContent = meta.slots?.some(s => s.name === '');
    if (takesContent && !CONTAINER_GROUPS.has(meta.group) && !/^pk-(stack|cluster|grid)$/.test(tag)) return { tag, text: title };
    return { tag };
}

// ---------------------------------------------------------------- where things go

/** Places to try, in order, for a new element `tag` given the selected node (null for none): inside it (the end of its default slot), after it, or the end of the page. */
export function insertionCandidates(doc, selectedId, registry) {
    const at = selectedId ? locate(doc, selectedId) : null;
    if (!at) return [{ parent: null, slot: '', index: undefined, where: 'at the end of the page' }];
    const entry = registry.entry(at.node.tag);
    const out = [];
    if (entry && !entry.void && entry.slots.some(s => s.name === '')) out.push({ parent: at.node.id, slot: '', index: undefined, where: `inside <${at.node.tag}>` });
    out.push({ parent: at.parent?.id ?? null, slot: at.slot ?? '', index: at.index + 1, where: `after <${at.node.tag}>` });
    return out;
}

/** The arguments for moveNode when the selected node moves 'up' or 'down' among its siblings, 'out' to its parent's level or 'in' to the element before it; null when it cannot. */
export function moveTarget(doc, id, direction) {
    const at = locate(doc, id);
    if (!at) return null;
    const list = at.parent ? at.parent.slots[at.slot] : doc.nodes;
    const i = at.index;
    if (direction === 'up') return i > 0 ? { id, parent: at.parent?.id ?? null, slot: at.slot ?? '', index: i - 1 } : null;
    if (direction === 'down') return i < list.length - 1 ? { id, parent: at.parent?.id ?? null, slot: at.slot ?? '', index: i + 1 } : null;
    if (direction === 'out') {
        if (!at.parent) return null;
        const up = locate(doc, at.parent.id);
        return { id, parent: up.parent?.id ?? null, slot: up.slot ?? '', index: up.index + 1 };
    }
    if (direction === 'in') {
        for (let k = i - 1; k >= 0; k--) if (!isText(list[k])) return { id, parent: list[k].id, slot: '', index: undefined };
        return null;
    }
    return null;
}

/** The id the arrow keys select next: Down and Up walk the page in document order, Left goes to the parent, Right to the first child, Home and End to the ends. */
export function nextSelection(doc, id, key) {
    const all = flatten(doc);
    if (!all.length) return null;
    const i = all.findIndex(n => n.id === id);
    if (i < 0) return all[0].id;
    if (key === 'ArrowDown') return all[Math.min(i + 1, all.length - 1)].id;
    if (key === 'ArrowUp') return all[Math.max(i - 1, 0)].id;
    if (key === 'Home') return all[0].id;
    if (key === 'End') return all.at(-1).id;
    if (key === 'ArrowLeft') return locate(doc, id).parent?.id ?? id;
    if (key === 'ArrowRight') { const kid = Object.values(all[i].slots).flat().find(c => !isText(c)); return kid ? kid.id : id; }
    return id;
}

/** After removing a node: the sibling that took its place, else the one before it, else its parent, else nothing. */
export function selectionAfterRemove(doc, id) {
    const at = locate(doc, id);
    if (!at) return null;
    const list = (at.parent ? at.parent.slots[at.slot] : doc.nodes).filter(c => !isText(c));
    const k = list.findIndex(n => n.id === id);
    return (list[k + 1] ?? list[k - 1])?.id ?? at.parent?.id ?? null;
}

// ---------------------------------------------------------------- inspector fields

const GLOBAL_FIELDS = [{ attr: 'id', type: 'string', description: 'The element id.' }, { attr: 'class', type: 'string', description: 'Utility class names, separated by spaces.' }];

/** The editable fields of a node: { attr, type: 'enum' | 'boolean' | 'number' | 'string' | 'json', values, default, description, value } for its declared props, then id and class. */
export function fieldsFor(entry, node) {
    if (!entry) return [];
    const fields = [];
    for (const [attr, info] of entry.props) {
        const meta = entry.meta?.props?.find(p => kebab(p.name) === attr);
        fields.push({ attr, type: info.type, values: info.values ?? [], default: meta?.default, description: meta?.description ?? '', value: node.props[attr] });
    }
    for (const g of GLOBAL_FIELDS) if (!entry.props.has(g.attr)) fields.push({ ...g, values: [], default: undefined, value: node.props[g.attr] });
    return fields;
}

/** What an inspector control's raw value means for setProp: '' removes a text, number or enum prop; a boolean is true or removed. */
export function propFromControl(type, raw) {
    if (type === 'boolean') return raw === true || raw === 'true' ? true : undefined;
    if (raw === undefined || raw === null || String(raw) === '') return undefined;
    return String(raw);
}

/** A one-line label for a node in the structure tree and the status line: the tag and the most telling prop or text. */
export function nodeLabel(node) {
    const text = (node.slots[''] ?? []).find(isText);
    const hint = node.props.heading ?? node.props.label ?? node.props.title ?? text;
    const short = typeof hint === 'string' && hint.length > 28 ? `${hint.slice(0, 27)}…` : hint;
    return short ? `${node.tag}: ${short}` : node.tag;
}

/** The element metadata the element inspector shows for a native tag, which the API does not describe. */
export function nativeMeta(tag, entry) {
    return {
        tag, title: tag, group: 'Native HTML', summary: `The native <${tag}> element. Only allow-listed native tags can be used in a page.`,
        props: [...entry.props].map(([attr, p]) => ({ name: attr, type: p.type, default: '', ...(p.values ? { values: p.values } : {}), description: '' })),
        slots: [{ name: '', description: 'Content.' }], events: [], parts: [], cssProperties: [], methods: [], writes: [],
    };
}

export { findNode };
