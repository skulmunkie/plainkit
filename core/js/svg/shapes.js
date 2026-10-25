// SVG toolkit, shape generators (#431, phase S2, tier A). Pure: no DOM, no side effects. Each function returns a node spec for ops.insert(doc, spec),
// which sanitises it and gives it ids, or null when the input cannot make the shape (a number that is not finite, a size of 0 or less, too few or too
// many corners). Angles are degrees, clockwise on screen (y down), 0 pointing right, as matrix.js rotate. Coordinates within 1e-9 of a whole number are
// written as that number, so a square or a quarter circle comes out exact.
//
//   regularPolygon({ cx, cy, r, sides: 6, rotation: 0 })          polygon, first corner straight up
//   star({ cx, cy, outer, inner: outer / 2, arms: 5, rotation: 0 }) polygon alternating outer and inner corners, first tip straight up
//   roundedRect({ x, y, width, height, r: 0 })                     rect with rx = ry = r, at most half the shorter side
//   arc({ cx, cy, r, start: 0, end: 90, pie: false })              path of cubic pieces (a quarter turn at most each); 360 or more is a closed circle; pie closes through the centre
//   grid({ x, y, width, height, cols: 1, rows: 1 })                path of the cols + 1 vertical and rows + 1 horizontal lines (a cutting or layout grid)

const MAX = 1000;     // corners, arms, columns or rows: well inside the model's segment limit
const tidy = v => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v);
const fin = (...v) => v.every(Number.isFinite);
const count = (n, min) => Number.isInteger(n) && n >= min && n <= MAX;
const ring = (cx, cy, radii, n, rotation) => {
    const pts = [];
    for (let k = 0; k < n; k++) {
        const a = (rotation - 90 + k * 360 / n) * Math.PI / 180, r = radii[k % radii.length];
        pts.push(tidy(cx + r * Math.cos(a)), tidy(cy + r * Math.sin(a)));
    }
    return pts;
};

export function regularPolygon({ cx = 0, cy = 0, r, sides = 6, rotation = 0 } = {}) {
    if (!fin(cx, cy, r, rotation) || r <= 0 || !count(sides, 3)) return null;
    return { type: 'polygon', attrs: { points: ring(cx, cy, [r], sides, rotation) } };
}

export function star({ cx = 0, cy = 0, outer, inner = outer / 2, arms = 5, rotation = 0 } = {}) {
    if (!fin(cx, cy, outer, inner, rotation) || outer <= 0 || inner <= 0 || !count(arms, 3)) return null;
    return { type: 'polygon', attrs: { points: ring(cx, cy, [outer, inner], arms * 2, rotation) } };
}

export function roundedRect({ x = 0, y = 0, width, height, r = 0 } = {}) {
    if (!fin(x, y, width, height, r) || width <= 0 || height <= 0 || r < 0) return null;
    const k = Math.min(r, width / 2, height / 2);
    return { type: 'rect', attrs: { x, y, width, height, ...(k > 0 ? { rx: k, ry: k } : {}) } };
}

export function arc({ cx = 0, cy = 0, r, start = 0, end = 90, pie = false } = {}) {
    if (!fin(cx, cy, r, start, end) || r <= 0 || start === end) return null;
    const sweep = Math.max(-360, Math.min(360, end - start)), full = Math.abs(sweep) === 360;
    const n = Math.ceil(Math.abs(sweep) / 90 - 1e-9), step = sweep / n * Math.PI / 180, h = 4 / 3 * Math.tan(step / 4);
    const pt = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    let a = start * Math.PI / 180;
    const [x0, y0] = pt(a), d = [['M', tidy(x0), tidy(y0)]];
    for (let i = 0; i < n; i++, a += step) {
        const [ax, ay] = pt(a), [bx, by] = pt(a + step);
        d.push(['C', ...[ax - h * r * Math.sin(a), ay + h * r * Math.cos(a), bx + h * r * Math.sin(a + step), by - h * r * Math.cos(a + step), bx, by].map(tidy)]);
    }
    if (pie && !full) d.push(['L', cx, cy]);
    if (pie || full) d.push(['Z']);
    return { type: 'path', attrs: { d } };
}

export function grid({ x = 0, y = 0, width, height, cols = 1, rows = 1 } = {}) {
    if (!fin(x, y, width, height) || width <= 0 || height <= 0 || !count(cols, 1) || !count(rows, 1)) return null;
    const d = [];
    for (let i = 0; i <= cols; i++) { const gx = tidy(x + width * i / cols); d.push(['M', gx, y], ['L', gx, y + height]); }
    for (let j = 0; j <= rows; j++) { const gy = tidy(y + height * j / rows); d.push(['M', x, gy], ['L', x + width, gy]); }
    return { type: 'path', attrs: { d } };
}
