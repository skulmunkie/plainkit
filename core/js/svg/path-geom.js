// SVG toolkit, geometry on path segments (#431, phase S3). Pure: no DOM, no side effects. Works on the model's absolute segments (['M', x, y], ['L', x, y],
// ['C', x1, y1, x2, y2, x, y], ['Z']; see path.js) and never trusts them blindly: a malformed list gives an empty or null result, never an exception.
//
//   bounds(segs)            { x, y, width, height } with exact curve extrema (not the control box), or null
//   transform(segs, m)      the segments through a 6-number matrix (matrix.js); a cubic stays a cubic under any affine map
//   reverse(segs)           every subpath runs the other way (same shape); subpaths keep their order
//   flatten(segs, tol)      [{ points: [x, y, ...], closed }] polylines within `tol` of the curves
//   length(segs), pointAt(segs, t)    arc length and the point and tangent angle (degrees) at fraction t of it
//   simplify(points, tol)   Douglas-Peucker on a flat [x, y, ...] list; fromPoints(points, closed) turns a polyline back into segments

import { LIMITS, cleanValue } from './allow.js';
import { apply } from './matrix.js';

const MAX_PIECES = 256;
const valid = segs => cleanValue('d', segs)[0];
const clamp = v => Math.min(LIMITS.coord, Math.max(-LIMITS.coord, v));

/** The t values in (0, 1) where one coordinate of a cubic (p0..p3) has a zero derivative. */
function extrema(p0, p1, p2, p3) {
    const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;      // the derivative divided by 3 is a t^2 + b t + c
    const roots = [];
    if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) roots.push(-c / b); }
    else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) { const q = Math.sqrt(disc); roots.push((-b + q) / (2 * a), (-b - q) / (2 * a)); }
    }
    return roots.filter(t => t > 0 && t < 1);
}
const cubic = (p0, p1, p2, p3, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };

/** Splits segments into subpaths: [{ start: [x, y], segs: [...drawing segments], closed }]. A lone moveto draws nothing and is skipped. */
function subpaths(segs) {
    const out = [];
    let cur = null;
    for (const s of segs) {
        if (s[0] === 'M') { cur = { start: [s[1], s[2]], segs: [], closed: false }; out.push(cur); }
        else if (s[0] === 'Z') { if (cur) cur.closed = true; }
        else if (cur && !cur.closed) cur.segs.push(s);
        else if (cur) { cur = { start: cur.start, segs: [s], closed: false }; out.push(cur); }      // drawing after Z starts a new subpath at the old start
    }
    return out.filter(p => p.segs.length);
}
const endOf = s => (s[0] === 'C' ? [s[5], s[6]] : [s[1], s[2]]);

export function bounds(segs) {
    if (!valid(segs)) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const take = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const sp of subpaths(segs)) {
        let [px, py] = sp.start;
        take(px, py);
        for (const s of sp.segs) {
            if (s[0] === 'C') {
                const [ax, ay, bx, by, x, y] = s.slice(1);
                for (const t of extrema(px, ax, bx, x)) take(cubic(px, ax, bx, x, t), cubic(py, ay, by, y, t));
                for (const t of extrema(py, ay, by, y)) take(cubic(px, ax, bx, x, t), cubic(py, ay, by, y, t));
            }
            [px, py] = endOf(s);
            take(px, py);
        }
    }
    return x0 === Infinity ? null : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function transform(segs, m) {
    if (!valid(segs) || !Array.isArray(m) || m.length !== 6 || !m.every(Number.isFinite)) return [];
    return segs.map(s => {
        const out = [s[0]];
        for (let k = 1; k < s.length; k += 2) { const [x, y] = apply(m, s[k], s[k + 1]); out.push(clamp(x), clamp(y)); }
        return out;
    });
}

export function reverse(segs) {
    if (!valid(segs)) return [];
    const out = [];
    for (let i = 0, j; i < segs.length; i = j) {
        j = i + 1;
        while (j < segs.length && segs[j][0] !== 'M') j++;
        const part = segs.slice(i, j);
        const closed = part[part.length - 1][0] === 'Z';
        const draw = part.slice(1, closed ? -1 : undefined).filter(s => s[0] !== 'Z');
        const pts = [part[0].slice(1)];                         // the points the subpath visits, in order
        for (const s of draw) pts.push(s.slice(-2));
        const start = pts[0];
        if (closed && (pts.length > 1 && (pts.at(-1)[0] !== start[0] || pts.at(-1)[1] !== start[1]))) { draw.push(['L', ...start]); pts.push(start); }
        const last = pts.at(-1);
        out.push(['M', ...last]);
        for (let k = draw.length - 1; k >= 0; k--) {
            const s = draw[k], to = pts[k];
            out.push(s[0] === 'C' ? ['C', s[3], s[4], s[1], s[2], ...to] : ['L', ...to]);
        }
        if (closed) out.push(['Z']);
    }
    return out;
}

/** Polylines within `tolerance` of the path (default 0.1 user units); a curve is cut into at most 256 pieces. */
export function flatten(segs, tolerance = 0.1) {
    if (!valid(segs)) return [];
    const tol = Number.isFinite(tolerance) && tolerance > 1e-6 ? tolerance : 0.1;
    const out = [];
    for (const sp of subpaths(segs)) {
        let [px, py] = sp.start;
        const pts = [px, py];
        for (const s of sp.segs) {
            if (s[0] === 'C') {
                const [ax, ay, bx, by, x, y] = s.slice(1);
                const dd = Math.max(Math.hypot(px - 2 * ax + bx, py - 2 * ay + by), Math.hypot(ax - 2 * bx + x, ay - 2 * by + y));
                const n = Math.min(MAX_PIECES, Math.max(1, Math.ceil(Math.sqrt(0.75 * dd / tol))));
                for (let k = 1; k < n; k++) { const t = k / n; pts.push(cubic(px, ax, bx, x, t), cubic(py, ay, by, y, t)); }
            }
            [px, py] = endOf(s);
            pts.push(px, py);
        }
        out.push({ points: pts, closed: sp.closed });
    }
    return out;
}

/** The pieces of a flattened path as [x0, y0, x1, y1] lines in drawing order, including each closing line. */
function lines(segs, tolerance) {
    const out = [];
    for (const { points, closed } of flatten(segs, tolerance)) {
        for (let k = 2; k < points.length; k += 2) out.push([points[k - 2], points[k - 1], points[k], points[k + 1]]);
        if (closed && points.length > 2) out.push([points.at(-2), points.at(-1), points[0], points[1]]);
    }
    return out;
}

export function length(segs, tolerance = 0.01) {
    return lines(segs, tolerance).reduce((sum, l) => sum + Math.hypot(l[2] - l[0], l[3] - l[1]), 0);
}

/** The point at fraction `t` (0..1, clamped) of the path's length: { x, y, angle } with the tangent angle in degrees, or null for an empty path. */
export function pointAt(segs, t, tolerance = 0.01) {
    const ls = lines(segs, tolerance);
    if (!ls.length) return null;
    const lens = ls.map(l => Math.hypot(l[2] - l[0], l[3] - l[1])), total = lens.reduce((a, b) => a + b, 0);
    let want = (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0) * total;
    for (let k = 0; k < ls.length; k++) {
        if (want <= lens[k] || k === ls.length - 1) {
            const f = lens[k] ? Math.min(1, want / lens[k]) : 0, l = ls[k];
            return { x: l[0] + (l[2] - l[0]) * f, y: l[1] + (l[3] - l[1]) * f, angle: Math.atan2(l[3] - l[1], l[2] - l[0]) * 180 / Math.PI };
        }
        want -= lens[k];
    }
    return null;
}

/** Douglas-Peucker on a flat [x, y, x, y, ...] list: the first and last points stay; no point is further than `tolerance` from the result. */
export function simplify(points, tolerance) {
    if (!Array.isArray(points) || points.length % 2 || !points.every(Number.isFinite)) return [];
    const n = points.length / 2;
    if (n < 3 || !(tolerance > 0)) return [...points];
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
        const [lo, hi] = stack.pop();
        const ax = points[lo * 2], ay = points[lo * 2 + 1], bx = points[hi * 2], by = points[hi * 2 + 1], len = Math.hypot(bx - ax, by - ay);
        let far = -1, best = tolerance;
        for (let k = lo + 1; k < hi; k++) {
            const px = points[k * 2], py = points[k * 2 + 1];
            const dist = len ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len : Math.hypot(px - ax, py - ay);
            if (dist > best) { best = dist; far = k; }
        }
        if (far >= 0) { keep[far] = 1; stack.push([lo, far], [far, hi]); }
    }
    const out = [];
    for (let k = 0; k < n; k++) if (keep[k]) out.push(points[k * 2], points[k * 2 + 1]);
    return out;
}

/** Segments for a flat polyline: M, L...; a closed one ends in Z. Fewer than two points give []. */
export function fromPoints(points, closed = false) {
    if (!Array.isArray(points) || points.length < 4 || points.length % 2 || !points.every(Number.isFinite)) return [];
    const out = [['M', clamp(points[0]), clamp(points[1])]];
    for (let k = 2; k < points.length; k += 2) out.push(['L', clamp(points[k]), clamp(points[k + 1])]);
    if (closed) out.push(['Z']);
    return out;
}
