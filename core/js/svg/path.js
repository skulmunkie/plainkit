// SVG toolkit, path data (#431, phase S3). Pure: no DOM, no side effects, no logging. Reads the whole `d` grammar of SVG paths and writes it back:
//
//   const { segments, problems } = parsePath('M10 10 h20 v20 a5 5 0 0 1 10 0 z');   // [['M', 10, 10], ['L', 30, 10], ['L', 30, 30], ['C', ...], ['Z']]
//   toD(segments, { precision: 3 })                                                  // 'M10 10L30 10L30 30C...Z'
//
// The model stores a path as absolute segments of four kinds only: ['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y], ['Z'] (js/svg/allow.js, kind 'd').
// Everything else is converted on the way in: relative to absolute, H and V to L, S to C (the reflected control point), Q and T to C (exact degree
// elevation), A to cubic Bezier pieces of at most a quarter turn. Geometry on segments (bounds, transform, reverse, flatten, length, pointAt, simplify) is
// in path-geom.js.
//
// parsePath never throws and follows SVG error handling: at the first error it keeps what came before and reports the position in problems. Numbers use
// the SVG grammar (signs, decimals, exponents, no separator needed between "1-2" or ".5.5"; arc flags may be written without a separator: "a1 1 0 00.5.5").
// Coordinates are clamped to LIMITS.coord, the segment count and the text length are limited by LIMITS.segments and LIMITS.input.

import { LIMITS, cleanValue } from './allow.js';
import { fmt } from './matrix.js';

const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const WS = /[\t\n\f\r ]*/y;
const problem = (code, message) => ({ code, severity: 'error', message, path: 'd' });

/** Cubic pieces (each [x1, y1, x2, y2, x, y]) for an SVG elliptical arc from (x0, y0), or null when the arc is a straight line (a zero radius). */
export function arcToCubics(x0, y0, rx, ry, rotation, large, sweep, x, y) {
    if (x0 === x && y0 === y) return [];
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry) return null;
    const phi = rotation * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
    const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
    const px = cos * dx + sin * dy, py = -sin * dx + cos * dy;
    const lam = px * px / (rx * rx) + py * py / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const num = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px, den = rx * rx * py * py + ry * ry * px * px;
    const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
    const cxp = k * rx * py / ry, cyp = -k * ry * px / rx;
    const cx = cos * cxp - sin * cyp + (x0 + x) / 2, cy = sin * cxp + cos * cyp + (y0 + y) / 2;
    const t1 = Math.atan2((py - cyp) / ry, (px - cxp) / rx);
    let dt = Math.atan2((-py - cyp) / ry, (-px - cxp) / rx) - t1;
    if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), step = dt / n, h = 4 / 3 * Math.tan(step / 4);
    const at = (u, v) => [cx + cos * rx * u - sin * ry * v, cy + sin * rx * u + cos * ry * v];
    const out = [];
    for (let i = 0; i < n; i++) {
        const a = t1 + i * step, b = a + step;
        const c1 = at(Math.cos(a) - h * Math.sin(a), Math.sin(a) + h * Math.cos(a));
        const c2 = at(Math.cos(b) + h * Math.sin(b), Math.sin(b) - h * Math.cos(b));
        out.push([...c1, ...c2, ...(i === n - 1 ? [x, y] : at(Math.cos(b), Math.sin(b)))]);
    }
    return out;
}

/** Parses path data into absolute M/L/C/Z segments; see the file header. `limits` may only tighten LIMITS. */
export function parsePath(d, limits = {}) {
    const cap = (k) => Math.min(LIMITS[k], Number.isFinite(limits?.[k]) ? limits[k] : LIMITS[k]);
    const maxSeg = cap('segments'), c = cap('coord');
    if (typeof d !== 'string') return { segments: [], problems: [problem('path-type', 'Path data must be text.')] };
    if (d.length > cap('input')) return { segments: [], problems: [problem('path-size', 'Path data is larger than the limit.')] };
    const out = [], problems = [];
    const clamp = v => Math.min(c, Math.max(-c, v));
    let i = 0, cmd = '', started = false, cx = 0, cy = 0, sx = 0, sy = 0, prev = '', lx = 0, ly = 0, again = false, need = false;
    const skip = () => { WS.lastIndex = i; WS.exec(d); i = WS.lastIndex; };
    const fail = (code, msg) => { problems.push(problem(code, `${msg} at position ${i}; the path was cut there.`)); };
    const comma = k => { skip(); if (d[i] === ',' && (k > 0 || again)) { i++; skip(); } };     // a comma may separate numbers, never follow the command letter
    const num = k => {
        comma(k);
        NUMBER.lastIndex = i;
        const m = NUMBER.exec(d);
        if (!m) return null;
        const v = Number(m[0]);
        if (!Number.isFinite(v)) return null;
        i = NUMBER.lastIndex;
        return v;
    };
    const flag = k => { comma(k); const f = d[i]; if (f !== '0' && f !== '1') return null; i++; return f === '1'; };
    const add = seg => { out.push(seg); };
    for (;;) {
        skip();
        if (i >= d.length) break;
        if (out.length >= maxSeg) { fail('limit-segments', `More than ${maxSeg} segments`); break; }
        const ch = d[i];
        const up = ch.toUpperCase();
        if (Object.hasOwn(ARGS, up) && ch.length === 1 && /[A-Za-z]/.test(ch)) {
            if (!started && up !== 'M') { fail('path-start', 'A path must start with a moveto (M)'); break; }
            cmd = ch; i++; again = false;
        } else if (!cmd || up === 'Z' || cmd.toUpperCase() === 'Z') { fail('path-syntax', `Unexpected "${ch.slice(0, 1)}"`); break; }
        const U = cmd.toUpperCase(), rel = cmd !== U;
        if (U === 'Z') {
            if (out.length && out[out.length - 1][0] !== 'Z') add(['Z']);
            cx = sx; cy = sy; prev = ''; need = true; again = true; cmd = 'Z';
            continue;
        }
        const a = [];
        for (let k = 0; k < ARGS[U]; k++) {
            const v = U === 'A' && (k === 3 || k === 4) ? flag(k) : num(k);
            if (v === null) { fail('path-number', `Expected ${ARGS[U]} numbers for ${U}`); a.length = 0; break; }
            a.push(v === true ? 1 : v === false ? 0 : v);
        }
        if (!a.length) break;
        again = true;
        const ox = rel ? cx : 0, oy = rel ? cy : 0;
        if (need && U !== 'M') { add(['M', sx, sy]); }
        need = false;
        started = true;
        let nx, ny;
        switch (U) {
            case 'M': nx = clamp(a[0] + ox); ny = clamp(a[1] + oy); add(['M', nx, ny]); sx = nx; sy = ny; cmd = rel ? 'l' : 'L'; prev = ''; break;
            case 'L': nx = clamp(a[0] + ox); ny = clamp(a[1] + oy); add(['L', nx, ny]); prev = ''; break;
            case 'H': nx = clamp(a[0] + ox); ny = cy; add(['L', nx, ny]); prev = ''; break;
            case 'V': nx = cx; ny = clamp(a[0] + oy); add(['L', nx, ny]); prev = ''; break;
            case 'C': { const s = [clamp(a[0] + ox), clamp(a[1] + oy), clamp(a[2] + ox), clamp(a[3] + oy), clamp(a[4] + ox), clamp(a[5] + oy)]; add(['C', ...s]); lx = s[2]; ly = s[3]; nx = s[4]; ny = s[5]; prev = 'C'; break; }
            case 'S': {
                const x1 = prev === 'C' ? 2 * cx - lx : cx, y1 = prev === 'C' ? 2 * cy - ly : cy;
                const s = [clamp(x1), clamp(y1), clamp(a[0] + ox), clamp(a[1] + oy), clamp(a[2] + ox), clamp(a[3] + oy)];
                add(['C', ...s]); lx = s[2]; ly = s[3]; nx = s[4]; ny = s[5]; prev = 'C'; break;
            }
            case 'Q': case 'T': {
                let qx, qy;
                if (U === 'Q') { qx = a[0] + ox; qy = a[1] + oy; nx = clamp(a[2] + ox); ny = clamp(a[3] + oy); }
                else { qx = prev === 'Q' ? 2 * cx - lx : cx; qy = prev === 'Q' ? 2 * cy - ly : cy; nx = clamp(a[0] + ox); ny = clamp(a[1] + oy); }
                qx = clamp(qx); qy = clamp(qy);
                add(['C', clamp(cx + 2 / 3 * (qx - cx)), clamp(cy + 2 / 3 * (qy - cy)), clamp(nx + 2 / 3 * (qx - nx)), clamp(ny + 2 / 3 * (qy - ny)), nx, ny]);
                lx = qx; ly = qy; prev = 'Q'; break;
            }
            case 'A': {
                nx = clamp(a[5] + ox); ny = clamp(a[6] + oy);
                const pieces = arcToCubics(cx, cy, a[0], a[1], a[2], a[3] === 1, a[4] === 1, nx, ny);
                if (pieces === null) add(['L', nx, ny]); else for (const p of pieces) add(['C', ...p.map(clamp)]);
                prev = ''; break;
            }
        }
        cx = nx; cy = ny;
    }
    if (out.length > maxSeg) { out.length = maxSeg; problems.push(problem('limit-segments', `More than ${maxSeg} segments; the path was cut.`)); }
    while (out.length && out[out.length - 1][0] === 'M') out.pop();          // a trailing moveto draws nothing
    if (out.length && out[0][0] !== 'M') out.length = 0;
    return { segments: out, problems };
}

/** The `d` text for absolute segments: shortest form without a space before a minus sign, `precision` decimals, deterministic. Invalid segments give ''. */
export function toD(segments, { precision = 3 } = {}) {
    const [ok, clean] = cleanValue('d', segments);
    if (!ok) return '';
    const p = Number.isInteger(precision) ? Math.min(8, Math.max(0, precision)) : 3;
    return clean.map(s => s[0] + s.slice(1).map(n => fmt(n, p)).join(' ')).join('').replace(/ -/g, '-');
}
