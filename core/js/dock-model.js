// The dock-tree model behind pk-dock: pure data and pure operations, no DOM and no logging (docs/superpowers/specs/2026-09-28-dockable-layout-design.md, issue 432).
// A layout is { version, seq, root }. root is a binary tree: a `split` (orientation, size percent, min, max, a, b: the props of pk-splitter) or a `tabs` group
// (an ordered list of panel ids and the active one). A panel is not a node: it is a declared id, held by exactly one group. Every operation returns
// { doc, problems } and never mutates or throws on data: a request that cannot be applied returns the input unchanged plus a problem.
// Step 1 of the spec: floating panels, collapse, close/open and undo add their fields and operations in later steps (fromJson drops keys it does not know).
import { clampSize } from './size.js';

export const VERSION = 1;
export const LIMITS = Object.freeze({ depth: 12, groups: 64, panels: 128, bytes: 65536 });
export const ZONES = ['center', 'left', 'right', 'top', 'bottom'];
const ID = /^d[1-9]\d{0,8}$/, PANEL = /^[a-z][\w-]{0,39}$/;
const SIZE = { min: 5, max: 95 };

const problem = (code, message, path = '') => ({ code, severity: 'warning', message, path });
const same = (doc, p) => ({ doc, problems: [p] });
const isSplit = n => n?.type === 'split';

function walk(n, f) { if (n) { f(n); if (isSplit(n)) { walk(n.a, f); walk(n.b, f); } } }
export const groups = doc => { const g = []; walk(doc.root, n => { if (!isSplit(n)) g.push(n); }); return g; };
export const panelIds = doc => groups(doc).flatMap(g => g.panels);
export const findGroup = (doc, panel) => groups(doc).find(g => g.panels.includes(panel)) ?? null;
export const findNode = (doc, id) => { let f = null; walk(doc.root, n => { if (n.id === id) f = n; }); return f; };
const depth = n => (isSplit(n) ? 1 + Math.max(depth(n.a), depth(n.b)) : 1);

// Replace the node with this id by fn(node) (null removes it, and its parent split collapses into the surviving sibling). Untouched branches are shared.
function edit(n, id, fn) {
    if (!n) return n;
    if (n.id === id) return fn(n);
    if (!isSplit(n)) return n;
    const a = edit(n.a, id, fn), b = edit(n.b, id, fn);
    if (a === n.a && b === n.b) return n;
    return a === null ? b : b === null ? a : { ...n, a, b };
}
const next = (doc, root, seq = doc.seq) => ({ ...doc, seq, root });
const tabs = (id, list, active = list[0]) => ({ id, type: 'tabs', active, panels: list });

export const emptyLayout = () => ({ version: VERSION, seq: 0, root: null });

// The layout a consumer gets with no saved one. panels: [{ id, group? }]; group is left, center, right or bottom (anything else is center). Left | center | right
// become split(left, split(center, right)) and a bottom group is stacked under all of them; an empty side is left out.
export function defaultLayout(panels) {
    const by = g => panels.filter(p => (g === 'center' ? !['left', 'right', 'bottom'].includes(p.group) : p.group === g)).map(p => p.id);
    let seq = 0;
    const group = ids => (ids.length ? tabs(`d${++seq}`, ids) : null);
    const join = (a, b, orientation, size) => (a && b ? { id: `d${++seq}`, type: 'split', orientation, size, min: SIZE.min, max: SIZE.max, a, b } : a ?? b);
    const [l, c, r, b] = ['left', 'center', 'right', 'bottom'].map(g => group(by(g)));
    const row = join(l, join(c, r, 'horizontal', 75), 'horizontal', 20);
    const root = join(row, b, 'vertical', 75);
    return { version: VERSION, seq, root };
}

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
    if (declared) for (const p of declared) if (!seen.has(p)) out.push(problem('panel-missing', `panel ${p} is in no group`, p));
    if (depth(doc.root) - 1 > LIMITS.depth || ids.size > LIMITS.groups * 2 || seen.size > LIMITS.panels) out.push(problem('limit', 'a limit is exceeded'));
    return out;
}

// Set a split's size (held to its min and max).
export function resize(doc, { split, size }) {
    const n = findNode(doc, split);
    if (!isSplit(n)) return same(doc, problem('unknown-split', `no split ${split}`, split));
    const s = clampSize(size, n.min ?? SIZE.min, n.max ?? SIZE.max);
    return s === n.size ? { doc, problems: [] } : { doc: next(doc, edit(doc.root, split, x => ({ ...x, size: s }))), problems: [] };
}

// Make a panel the active one of its group.
export function activate(doc, { panel }) {
    const g = findGroup(doc, panel);
    if (!g) return same(doc, problem('unknown-panel', `no panel ${panel}`, panel));
    return g.active === panel ? { doc, problems: [] } : { doc: next(doc, edit(doc.root, g.id, x => ({ ...x, active: panel }))), problems: [] };
}

// Take a panel out of its group (the group goes when it was the last one). Returns the new root.
function lift(doc, panel) {
    const g = findGroup(doc, panel);
    return edit(doc.root, g.id, x => {
        const rest = x.panels.filter(p => p !== panel);
        return rest.length ? { ...x, panels: rest, active: x.active === panel ? rest[Math.min(x.panels.indexOf(panel), rest.length - 1)] : x.active } : null;
    });
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

export const toJson = doc => JSON.stringify(doc);

// The one door for stored, imported or shared data. input: a JSON string or an object; panels: [{ id, group? }] declared now. Rebuilds the tree from known fields only,
// drops panels that are not declared and groups that empty, and appends declared panels the data lacks to the first group (or a default layout when there is no tree).
// Anything unusable gives defaultLayout(panels) and a problem. Result: { doc, problems }; the doc always passes validate().
export function fromJson(input, { panels = [] } = {}) {
    const declared = panels.filter(p => PANEL.test(p?.id)), known = new Set(declared.map(p => p.id)), problems = [];
    const fallback = why => { problems.push(problem('fallback', `${why}: using the default layout`)); return { doc: defaultLayout(declared), problems }; };
    let data = input;
    if (typeof input === 'string') {
        if (input.length > LIMITS.bytes) return fallback('the layout is too large');
        try { data = JSON.parse(input); } catch { return fallback('the layout is not valid JSON'); }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fallback('the layout is not an object');
    if (data.version !== VERSION) return fallback(`layout version ${String(data.version)} is not ${VERSION}`);
    const used = new Set(), ids = new Set(); let seq = 0, count = 0, dropped = 0;
    const idOf = raw => { if (ID.test(raw) && !ids.has(raw)) { ids.add(raw); seq = Math.max(seq, Number(raw.slice(1))); return raw; } return null; };
    const build = (n, d) => {
        if (!n || typeof n !== 'object' || d > LIMITS.depth || count > LIMITS.groups * 2) { dropped++; return null; }
        count++;
        const id = idOf(n.id);
        if (n.type === 'split') {
            const a = build(n.a, d + 1), b = build(n.b, d + 1);
            if (!a || !b) return a ?? b;
            const min = Number.isFinite(n.min) ? clampSize(n.min, 0, 100) : SIZE.min, max = Number.isFinite(n.max) ? clampSize(n.max, 0, 100) : SIZE.max;
            return { id, type: 'split', orientation: n.orientation === 'vertical' ? 'vertical' : 'horizontal', size: clampSize(n.size, min, max), min: Math.min(min, max), max: Math.max(min, max), a, b };
        }
        const list = (Array.isArray(n.panels) ? n.panels : []).filter(p => known.has(p) && !used.has(p) && used.add(p));
        if (!list.length) { dropped++; return null; }
        return { id, type: 'tabs', active: list.includes(n.active) ? n.active : list[0], panels: list };
    };
    let root = build(data.root, 1);
    // Nodes whose id was missing, malformed or repeated get the next free ones (assigned here in tree order).
    const give = n => { if (n) { if (!n.id) n.id = `d${++seq}`; if (isSplit(n)) { give(n.a); give(n.b); } } };
    if (Number.isInteger(data.seq) && data.seq > seq && data.seq < 1e9) seq = data.seq; // ids are never reused, so the stored counter stays when it is ahead
    give(root);
    if (dropped) problems.push(problem('repaired', `${dropped} unusable node(s) dropped`));
    const missing = declared.filter(p => !used.has(p.id));
    if (missing.length) {
        problems.push(problem('panel-added', `panels not in the stored layout: ${missing.map(p => p.id).join(', ')}`));
        if (!root) return { doc: defaultLayout(declared), problems };
        const first = groups({ root })[0], list = [...first.panels, ...missing.map(p => p.id)];
        root = edit(root, first.id, x => ({ ...x, panels: list }));
    }
    const doc = { version: VERSION, seq, root };
    return { doc, problems };
}
