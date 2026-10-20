// SVG toolkit, matrices (#431, phase S1). Pure: no DOM, no side effects. A transform is a 6-number array [a, b, c, d, e, f], the SVG matrix
//   | a c e |
//   | b d f |     x' = a*x + c*y + e,  y' = b*x + d*y + f
//   | 0 0 1 |
// The model keeps transforms as matrices and writes strings only on export (toTransform). Composition order: multiply(p, c) applies c first, then p
// (a parent matrix times a child matrix), which is what nesting <g transform> means.

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

export const isMatrix = m => Array.isArray(m) && m.length === 6 && m.every(Number.isFinite);
export const isIdentity = m => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

export const multiply = (p, c) => [
    p[0] * c[0] + p[2] * c[1], p[1] * c[0] + p[3] * c[1],
    p[0] * c[2] + p[2] * c[3], p[1] * c[2] + p[3] * c[3],
    p[0] * c[4] + p[2] * c[5] + p[4], p[1] * c[4] + p[3] * c[5] + p[5],
];

export const translate = (tx, ty = 0) => [1, 0, 0, 1, tx, ty];
export const scale = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];
export const skewX = deg => [1, 0, Math.tan(deg * Math.PI / 180), 1, 0, 0];
export const skewY = deg => [1, Math.tan(deg * Math.PI / 180), 0, 1, 0, 0];

/** Rotation by `deg` degrees (clockwise on screen, y down), about (cx, cy) when given. Exact for multiples of 90. */
export function rotate(deg, cx = 0, cy = 0) {
    const q = ((deg % 360) + 360) % 360;
    const exact = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] }[q];
    const [cos, sin] = exact ?? [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
    const r = [cos, sin, -sin, cos, 0, 0];
    return cx || cy ? multiply(multiply(translate(cx, cy), r), translate(-cx, -cy)) : r;
}

export const determinant = m => m[0] * m[3] - m[1] * m[2];

/** The inverse, or null when the matrix is singular (a flattened shape cannot be un-transformed). */
export function invert(m) {
    const det = determinant(m);
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Splits a matrix into translate, rotate (degrees), scale and skew (the tangent of the skew angle), or null when singular. */
export function decompose(m) {
    const det = determinant(m);
    if (!Number.isFinite(det) || det === 0) return null;
    const sx = Math.hypot(m[0], m[1]);
    const rotation = Math.atan2(m[1], m[0]);
    const skew = (m[0] * m[2] + m[1] * m[3]) / det;
    const sy = det / sx;
    return { tx: m[4], ty: m[5], rotation: rotation * 180 / Math.PI, sx, sy, skew };
}

/** Rebuilds the matrix decompose() split: compose(decompose(m)) equals m up to rounding. */
export const compose = ({ tx, ty, rotation, sx, sy, skew }) =>
    multiply(multiply(translate(tx, ty), rotate(rotation)), multiply([1, 0, skew, 1, 0, 0], scale(sx, sy)));

export const equals = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) <= eps);

/** A number with at most `precision` decimals and no trailing zeros ("-0" never appears). */
export function fmt(n, precision = 3) {
    const s = String(Number(n.toFixed(precision)));
    return s === '-0' ? '0' : s;
}

/** The SVG attribute text for a matrix: translate or scale when it is exactly one, else matrix(...). Identity gives ''. */
export function toTransform(m, precision = 3) {
    const f = n => fmt(n, precision);
    const [a, b, c, d, e, f2] = m.map(f);
    if (a === '1' && b === '0' && c === '0' && d === '1') return e === '0' && f2 === '0' ? '' : `translate(${e}${f2 === '0' ? '' : ' ' + f2})`;
    if (b === '0' && c === '0' && e === '0' && f2 === '0') return `scale(${a}${d === a ? '' : ' ' + d})`;
    return `matrix(${a} ${b} ${c} ${d} ${e} ${f2})`;
}
