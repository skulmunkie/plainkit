// The geometry of pk-canvas selection (#430 phase C3), pure functions, no DOM. A rect is { x, y, w, h } in world units (y down); the selection layer
// (js/canvas-select.js) reads rects from the items' data-x, data-y, data-w, data-h and calls these. Nothing here reads layout, so a pointermove never does.

// The rect an item declares through its dataset, or null when any of the four numbers is missing or not finite.
export function readRect(data) {
    const r = { x: Number(data.x), y: Number(data.y), w: Number(data.w), h: Number(data.h) };
    return data.x != null && data.y != null && data.w != null && data.h != null && Object.values(r).every(Number.isFinite) ? r : null;
}

// The rect an element declares: its data-x, data-y, data-w, data-h, or an SVG child's own x, y, width, height attributes.
export function declaredRect(el) {
    const d = el.dataset ?? {}, a = n => el.getAttribute?.(n) ?? undefined;
    return readRect(d.x != null ? d : { x: a('x'), y: a('y'), w: a('width'), h: a('height') });
}

// The rect between two points, whichever way the drag went.
export const between = (ax, ay, bx, by) => ({ x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });

// Do two rects overlap (touching edges do not count)?
export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Does rect a contain rect b entirely?
export const contains = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;

// The ids of the items { id, x, y, w, h } a marquee rect touches (or, with `inside`, holds entirely), in item order.
export const marquee = (items, rect, inside = false) => items.filter(i => (inside ? contains(rect, i) : overlaps(rect, i))).map(i => i.id);

// The selection after a gesture: `ids` replace it, or with `additive` toggle in it (an id already selected leaves, the others join), keeping the order of `current` then `ids`.
export function combine(current, ids, additive) {
    if (!additive) return [...new Set(ids)];
    const out = current.filter(c => !ids.includes(c));
    return [...out, ...ids.filter(i => !current.includes(i))];
}

// The eight resize handles of a rect, corners first then edges: [{ name, x, y }] in the rect's own units (#430 phase C4).
export const HANDLES = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'];
export const handles = r => HANDLES.map(name => ({
    name,
    x: r.x + (name.includes('w') ? 0 : name.includes('e') ? r.w : r.w / 2),
    y: r.y + (name.includes('n') ? 0 : name.includes('s') ? r.h : r.h / 2),
}));

// The rect after dragging handle `name` by (dx, dy): the opposite side stays (with `centre` the centre stays and both sides move), `ratio` keeps the
// aspect ratio on a corner handle, and no side gets smaller than `min`: a handle dragged past the opposite side stops there, it never flips.
export function resizeRect(r, name, dx, dy, { min = 1, ratio = false, centre = false } = {}) {
    const k = centre ? 2 : 1, fx = name.includes('w') ? -1 : name.includes('e') ? 1 : 0, fy = name.includes('n') ? -1 : name.includes('s') ? 1 : 0;
    let w = Math.max(min, r.w + fx * dx * k), h = Math.max(min, r.h + fy * dy * k);
    if (ratio && fx && fy && r.w > 0 && r.h > 0) { const s = Math.max(w / r.w, h / r.h); w = Math.max(min, r.w * s); h = Math.max(min, r.h * s); }
    return {
        x: centre ? r.x + (r.w - w) / 2 : fx < 0 ? r.x + r.w - w : r.x,
        y: centre ? r.y + (r.h - h) / 2 : fy < 0 ? r.y + r.h - h : r.y,
        w, h,
    };
}

// A world rect as frame pixels for a view { x, y, zoom } (x and y are where the world origin sits), and a frame rect back as a world rect.
export const toFrame = (v, r) => ({ x: v.x + r.x * v.zoom, y: v.y + r.y * v.zoom, w: r.w * v.zoom, h: r.h * v.zoom });
export const fromFrame = (v, r) => ({ x: (r.x - v.x) / v.zoom, y: (r.y - v.y) / v.zoom, w: r.w / v.zoom, h: r.h / v.zoom });
