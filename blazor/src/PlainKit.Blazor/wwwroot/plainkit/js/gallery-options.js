// The gallery's embedding options and the pure logic around them: parsing them from a query string, writing them back, and cutting the
// content tree down to what an embedder asked for. No DOM, no fetch; the gallery module and the <pk-gallery> element share it.

// 'controls' is the old name of the elements section (the class-based controls are gone): still accepted, and it means elements.
export const KINDS = ['foundations', 'controls', 'elements', 'layouts', 'templates'];
export const THEMES = ['dark', 'light'];
export const WIDTHS = ['desktop', 'phone'];
export const CHROMES = ['full', 'none'];

// The page <pk-gallery> frames (the build points the dist copy of this module at dist/gallery/embed.html).
export const EMBED_URL = new URL('../gallery/embed.html', import.meta.url).href;

const slug = s => String(s).replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const words = v => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
const pick = (v, allowed) => (allowed.includes(v) ? v : undefined);

// Anything unknown is dropped rather than guessed at, so a typo shows the whole gallery instead of a blank one.
export function normalizeOptions(raw = {}) {
    const o = {};
    const kind = pick(String(raw.kind ?? '').toLowerCase(), KINDS); if (kind) o.kind = kind;
    const group = slug(raw.group ?? ''); if (group) o.group = group;
    const control = [...new Set((Array.isArray(raw.control) ? raw.control : words(raw.control)).map(s => String(s).trim().toLowerCase()).filter(Boolean))]; if (control.length) o.control = control;
    const theme = pick(raw.theme, THEMES); if (theme) o.theme = theme;
    const width = pick(raw.width, WIDTHS); if (width) o.width = width;
    const filter = String(raw.filter ?? '').trim(); if (filter) o.filter = filter;
    const chrome = pick(raw.chrome, CHROMES); if (chrome) o.chrome = chrome;
    const height = Number(raw.height); if (Number.isFinite(height) && height > 0) o.height = Math.round(height);
    return o;
}

export function parseQuery(search) {
    const q = new URLSearchParams(search);
    return normalizeOptions(Object.fromEntries(['kind', 'group', 'control', 'theme', 'width', 'filter', 'chrome', 'height'].map(k => [k, q.get(k)])));
}

export function toQuery(options) {
    const o = normalizeOptions(options);
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) q.set(k, Array.isArray(v) ? v.join(',') : String(v));
    return q.toString();
}

// True when the options narrow the content (kind, group or control); theme, width, filter and chrome only change how it looks.
export const isScoped = o => Boolean(o.kind || o.group || o.control?.length);

// The tree is [{ id, title, items | groups: [{ id, title, items }] }], the shape the gallery builds. Kind picks a section (layouts and
// templates are groups of the samples section; no kind, or the old 'controls', means elements), group picks a group by id or title, control picks
// items by id (an element by tag, with or without the pk- prefix).
export function restrictTree(tree, options) {
    if (!isScoped(options)) return tree;
    const kind = !options.kind || options.kind === 'controls' ? 'elements' : options.kind;
    const wanted = options.control ?? [];
    const takes = it => { const id = String(it.id).toLowerCase(); return !wanted.length || wanted.includes(id) || wanted.includes(id.replace(/^pk-/, '')); };
    const inGroup = g => !options.group || options.group === g.id || options.group === slug(g.title);
    const real = it => it.id !== 'overview';
    const sectionId = kind === 'layouts' || kind === 'templates' ? 'samples' : kind;
    const out = [];
    for (const sec of tree) {
        if (sec.id !== sectionId) continue;
        if (sec.items) {
            const items = sec.items.filter(it => real(it) && takes(it));
            if (items.length) out.push({ ...sec, items });
            continue;
        }
        const groups = sec.groups
            .filter(g => (sectionId !== 'samples' || g.id === kind) && inGroup(g))
            .map(g => ({ ...g, items: g.items.filter(it => real(it) && takes(it)) }))
            .filter(g => g.items.length);
        if (groups.length) out.push({ ...sec, groups });
    }
    return out;
}

// The same match as filterLeaves, applied to the tree itself (a group whose title matches keeps all its items; empty groups and sections drop),
// so an overview page can list only what the filter leaves.
export function filterTree(tree, filter) {
    const f = String(filter ?? '').trim().toLowerCase();
    if (!f) return tree;
    const has = t => String(t).toLowerCase().includes(f);
    return tree
        .map(sec => (sec.items
            ? { ...sec, items: sec.items.filter(it => has(it.title)) }
            : { ...sec, groups: sec.groups.map(g => ({ ...g, items: has(g.title) ? g.items : g.items.filter(it => has(it.title)) })).filter(g => g.items.length) }))
        .filter(sec => (sec.items ?? sec.groups).length);
}

// Every leaf of a tree, with the group it sits in.
export function leaves(tree) {
    return tree.flatMap(sec => (sec.items ?? sec.groups.flatMap(g => g.items.map(it => ({ ...it, group: g })))).map(it => ({ ...it, section: sec })));
}

// Leaves whose title (or group title) contains the filter text, case-insensitively; no filter keeps everything.
export function filterLeaves(list, filter) {
    const f = String(filter ?? '').trim().toLowerCase();
    return f ? list.filter(it => it.title.toLowerCase().includes(f) || it.group?.title.toLowerCase().includes(f)) : list;
}

// Where the gallery opens: the one element, the one group, or the section the options name; empty when nothing narrows the view.
export function initialHash(tree) {
    if (!tree.length) return '';
    const all = leaves(tree);
    if (all.length === 1) return all[0].hash;
    const groups = new Set(all.map(l => l.group?.id));
    if (tree.length === 1 && groups.size === 1 && all[0].group) return all[0].group.hash;
    return tree.length === 1 ? `#/${tree[0].id}` : '';
}
