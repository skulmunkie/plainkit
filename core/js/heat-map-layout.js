// The maths of pk-heat-map (#1721): a squarified treemap (Bruls, Huizing, van Wijk). Pure functions, no DOM, deterministic (ties keep the input order).
//
//   layout(items, width, height, { minBox, layout, maxItems }) -> [{ id, x, y, w, h, value, item, severity?, members? }]
//
// The boxes tile the rectangle exactly (whole pixels, shared edges, the last box takes the rounding remainder), largest first. A box whose shorter side is
// under minBox is merged, with every other such box, into one Other box (id OTHER_ID, `members` = the merged items); items are merged, never dropped. A lone small box
// is merged with the next smallest one (unless that is over a quarter of the total), and this repeats until no box is under minBox.
// layout 'squarified' (default) sorts by value; 'rows' keeps the input order, so positions stay put while values change. maxItems (0 = no cap) merges everything
// after the top N by value into Other. A box that cannot be merged away yet stays under minBox is given a little more weight (never more than 40% of the total)
// until it reaches minBox, so a tile is never a thin strip. The gap between boxes is drawn by the element's css, not here, so the tiling stays exact.

export const OTHER_ID = '__other';
const SHARE_LIMIT = 0.25;
export const SEVERITIES = ['neutral', 'info', 'success', 'warning', 'danger'];

// The worst aspect ratio of a row of areas laid along a side of length `side` (>= 1; 1 is a square).
export function worstRatio(areas, side) {
    const s = areas.reduce((a, b) => a + b, 0), hi = Math.max(...areas), lo = Math.min(...areas);
    return Math.max((side * side * hi) / (s * s), (s * s) / (side * side * lo));
}

const RANK = { neutral: 0, success: 1, info: 2, warning: 3, danger: 4 };
/** The most serious severity among items (danger, warning, info, success, neutral). */
export const worstSeverity = list => list.reduce((w, it) => (RANK[it.severity ?? 'neutral'] > RANK[w] ? it.severity : w), 'neutral');

// Usable items from whatever the host gave: { id, label, value > 0, severity, intensity? }. report(message) is told about each item that is dropped or repaired.
export function cleanItems(raw, report = () => {}) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    raw.forEach((r, i) => {
        if (!r || typeof r !== 'object') return report(`items[${i}] is not an object: skipped`);
        const value = Number(r.value);
        if (!(value > 0) || !Number.isFinite(value)) return report(`items[${i}] needs a value above 0 (got ${JSON.stringify(r.value)}): skipped`);
        let severity = r.severity ?? 'neutral';
        if (!SEVERITIES.includes(severity)) { report(`items[${i}] has an unknown severity ${JSON.stringify(r.severity)}: using neutral`); severity = 'neutral'; }
        let intensity;
        if (r.intensity != null) {
            const n = Number(r.intensity);
            if (Number.isFinite(n) && typeof r.intensity !== 'boolean') intensity = Math.min(1, Math.max(0, n)); else report(`items[${i}] has an intensity that is not a number (${JSON.stringify(r.intensity)}): ignored`);
        }
        const label = String(r.label ?? r.id ?? i);
        out.push({ ...r, id: String(r.id ?? label), label, value, severity, intensity });
    });
    return out;
}

// One squarified pass over `list` in the order given: rects in the same order, as floats. An entry's weight (default its value) sets its area.
function tile(list, width, height) {
    const w0 = it => it.weight ?? it.value, total = list.reduce((a, it) => a + w0(it), 0), scale = (width * height) / total;
    const rest = list.map((it, i) => ({ i, a: w0(it) * scale })), rects = new Array(list.length);
    let x = 0, y = 0, w = width, h = height, row = [];
    const place = () => {
        const s = row.reduce((a, r) => a + r.a, 0);
        if (w >= h) { const cw = s / h; let cy = y; for (const r of row) { rects[r.i] = { x, y: cy, w: cw, h: r.a / cw }; cy += r.a / cw; } x += cw; w -= cw; }
        else { const rh = s / w; let cx = x; for (const r of row) { rects[r.i] = { x: cx, y, w: r.a / rh, h: rh }; cx += r.a / rh; } y += rh; h -= rh; }
        row = [];
    };
    while (rest.length) {
        const side = Math.min(w, h), next = rest[0];
        if (!row.length || worstRatio([...row, next].map(r => r.a), side) <= worstRatio(row.map(r => r.a), side)) row.push(rest.shift());
        else place();
    }
    if (row.length) place();
    return rects;
}

// Snap the float rects to whole pixels. Neighbouring boxes round the same shared edge, so nothing overlaps or leaves a seam, and the outer edges land on width and height.
const snap = (r, width, height) => {
    const x0 = Math.round(r.x), y0 = Math.round(r.y);
    const x1 = Math.abs(r.x + r.w - width) < 1e-6 ? width : Math.round(r.x + r.w), y1 = Math.abs(r.y + r.h - height) < 1e-6 ? height : Math.round(r.y + r.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const mergeInto = members => ({ id: OTHER_ID, value: members.reduce((a, t) => a + t.value, 0), item: null, members: members.flatMap(t => t.members ?? [t.item]), severity: worstSeverity(members.flatMap(t => t.members ?? [t.item])), i: Infinity });

export function layout(items, width, height, { minBox = 0, layout: mode = 'squarified', maxItems = 0 } = {}) {
    if (!(width > 0 && height > 0)) return [];
    const byValue = (a, b) => b.value - a.value || a.i - b.i;
    const order = list => list.sort((a, b) => (a.id === OTHER_ID) - (b.id === OTHER_ID) || (mode === 'rows' ? a.i - b.i : byValue(a, b)));
    let list = items.filter(it => it.value > 0 && Number.isFinite(it.value)).map((item, i) => ({ id: item.id, value: item.value, item, i }));
    if (!list.length) return [];
    if (maxItems > 0 && list.length > maxItems) {
        const keep = new Set([...list].sort(byValue).slice(0, maxItems));
        list = [...list.filter(it => keep.has(it)), mergeInto(list.filter(it => !keep.has(it)))];
    }
    order(list);
    const rectsOf = () => tile(list, width, height).map(r => snap(r, width, height));
    const small = rects => list.map((_, k) => k).filter(k => minBox > 0 && Math.min(rects[k].w, rects[k].h) < minBox);
    let rects;
    for (let pass = 0; ; pass++) {
        rects = rectsOf();
        let tiny = small(rects).map(k => list[k]);
        // One small box alone would stay too small: it takes the smallest box that is not small with it (so Other holds at least two), unless that one is a big
        // share of the whole (a dominant item is never swallowed to make room for a sliver).
        if (tiny.length === 1 && list.length > 1) {
            const partner = list.filter(it => !tiny.includes(it)).sort(byValue).at(-1);
            tiny = partner.value <= SHARE_LIMIT * list.reduce((a, it) => a + it.value, 0) ? [tiny[0], partner] : [];
        }
        if (!tiny.length || list.length < 2 || pass > list.length) break;
        list = order([...list.filter(it => !tiny.includes(it)), mergeInto(tiny)]);
    }
    // What could not be merged away stays a real box: give it area until it reaches minBox.
    for (let n = 0; n < 40 && list.length > 1; n++) {
        const bad = small(rects);
        const total = list.reduce((a, it) => a + (it.weight ?? it.value), 0), it = list[bad[0]];
        if (bad.length !== 1 || (it.weight ?? it.value) / total > 0.4) break;
        it.weight = (it.weight ?? it.value) * 1.25;
        rects = rectsOf();
    }
    return list.map((it, k) => ({ id: it.id, ...rects[k], value: it.value, item: it.item, ...(it.members ? { members: it.members, severity: it.severity } : {}) }));
}
