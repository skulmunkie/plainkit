// Serialising and the one door for stored data of the dock-tree model (js/dock-model.js re-exports them). Pure data, no DOM, no logging (issue 1108).
import { clampSize } from './size.js';
import { VERSION, LIMITS, PANEL, ID, SIZE, problem, isSplit, groups, clampRect, edit, defaultLayout } from './dock-tree.js';

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
    // Floaters: same known-fields-only rebuild as a group, plus a clamped rect. A malformed one is dropped, not fatal to the rest of the layout.
    let floatersOut = [];
    if (Array.isArray(data.floating)) for (const raw of data.floating) {
        if (!raw || typeof raw !== 'object' || floatersOut.length >= LIMITS.floaters) { dropped++; continue; }
        const id = idOf(raw.id), g = raw.group && typeof raw.group === 'object' ? raw.group : null, gid = g ? idOf(g.id) : null;
        const list = g ? (Array.isArray(g.panels) ? g.panels : []).filter(p => known.has(p) && !used.has(p) && used.add(p)) : [];
        if (!id || !gid || !list.length) { dropped++; continue; }
        floatersOut.push({ id, ...clampRect(raw, null), z: Number.isFinite(raw.z) ? raw.z : floatersOut.length + 1, group: { id: gid, type: 'tabs', active: list.includes(g.active) ? g.active : list[0], panels: list } });
    }
    if (dropped) problems.push(problem('repaired', `${dropped} unusable node(s) dropped`));
    const missing = declared.filter(p => !used.has(p.id));
    if (missing.length) {
        problems.push(problem('panel-added', `panels not in the stored layout: ${missing.map(p => p.id).join(', ')}`));
        if (root) {
            const first = groups({ root })[0], list = [...first.panels, ...missing.map(p => p.id)];
            root = edit(root, first.id, x => ({ ...x, panels: list }));
        } else if (floatersOut.length) {
            const first = floatersOut[0], list = [...first.group.panels, ...missing.map(p => p.id)];
            floatersOut = floatersOut.map(f => (f === first ? { ...f, group: { ...f.group, panels: list } } : f));
        } else {
            return { doc: defaultLayout(declared), problems };
        }
    }
    const collapsed = [...new Set((Array.isArray(data.collapsed) ? data.collapsed : []).filter(p => typeof p === 'string' && used.has(p)))];
    const doc = { version: VERSION, seq, root, collapsed, floating: floatersOut };
    return { doc, problems };
}
