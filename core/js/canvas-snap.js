// The snapping maths of pk-canvas (#430 phase C5), pure: no DOM. Rects are { x, y, w, h } in world units, guides { axis: 'x' | 'y', at }, targets
// rects with an optional id. Each axis snaps on its own to the nearest line within `threshold` (world units: the caller divides its screen-pixel
// threshold by the zoom). The moving rect's start and end edges snap to the grid, the guides and the targets' edges; its centre (with `centres`) to
// the guides and the targets' centres. Ties: start edge, end edge, centre; for one edge: guides, then targets, then the grid.
//
//   snapValue(12, [0, 10, 20], 3)      -> { value: 10, line: 10 }   (no line within the threshold: { value: 12, line: null })
//   snapRect(rect, { grid, guides, targets, threshold, edges: true, centres: false }) -> { rect, hits: [{ axis, at, source: 'grid'|'guide'|'edge'|'centre', id? }] }

export function snapValue(v, lines, threshold) {
    let best = null;
    for (const l of lines) if (Math.abs(l - v) <= threshold && (best === null || Math.abs(l - v) < Math.abs(best - v))) best = l;
    return { value: best ?? v, line: best };
}

const AX = { x: ['x', 'w'], y: ['y', 'h'] };

export function snapRect(rect, { grid = 0, guides = [], targets = [], threshold = 0, edges = true, centres = false } = {}) {
    const out = { ...rect }, hits = [];
    if (!(threshold > 0)) return { rect: out, hits };
    for (const axis of ['x', 'y']) {
        const [p, s] = AX[axis], lines = [];
        for (const g of guides) if (g?.axis === axis && Number.isFinite(g.at)) lines.push({ at: g.at, source: 'guide' });
        for (const t of targets) {
            if (!t) continue;
            if (edges) lines.push({ at: t[p], source: 'edge', id: t.id }, { at: t[p] + t[s], source: 'edge', id: t.id });
            if (centres) lines.push({ at: t[p] + t[s] / 2, source: 'centre', id: t.id });
        }
        const own = [[rect[p], 0, false], [rect[p] + rect[s], rect[s], false]];      // [position, offset from the rect's start, is the centre]
        if (centres) own.push([rect[p] + rect[s] / 2, rect[s] / 2, true]);
        let best = null;
        const consider = (l, v, off) => {
            const d = Math.abs(l.at - v);
            if (d <= threshold && (!best || d < best.d)) best = { d, start: l.at - off, hit: { axis, at: l.at, source: l.source, ...(l.id !== undefined ? { id: l.id } : {}) } };
        };
        for (const [v, off, mid] of own) {
            for (const l of lines) if (l.source === 'guide' || (l.source === 'centre') === mid) consider(l, v, off);
            if (grid > 0 && !mid) consider({ at: Math.round(v / grid) * grid, source: 'grid' }, v, off);
        }
        if (best) { out[p] = best.start; hits.push(best.hit); }
    }
    return { rect: out, hits };
}
