// SVG toolkit, the allow-list (#431, phase S1). ONE frozen table says which node types and attributes may exist and what a value must look like. The
// model (model.js) checks against it now; the importer and exporter of phase S5 are driven by the same table, so the two directions cannot drift.
// Pure data and checks: no DOM, no side effects.
//
// An attribute kind is one of:
//   'n' finite number   'p' number >= 0   'o' number in 0..1   'paint' colour grammar   'str' short text   'bool'   'class' token list
//   'matrix' six numbers   'points' flat [x, y, x, y...]   'd' parsed path segments   'dash' up to 8 numbers >= 0   or an array of allowed strings.
// Numbers are clamped to +-LIMITS.coord, never rejected for being large; everything else that does not fit is refused (the caller reports it).

import { isMatrix, isIdentity } from './matrix.js';

export const LIMITS = Object.freeze({ nodes: 5000, depth: 16, segments: 10000, coord: 1e6, input: 2000000, text: 10000, label: 200 });

export const UNITS = Object.freeze(['px', 'mm', 'cm', 'in', 'pt']);
export const FONTS = Object.freeze(['sans-serif', 'serif', 'monospace', 'system-ui', 'Arial', 'Helvetica', 'Times New Roman', 'Courier New']);

const COMMON = {
    fill: 'paint', stroke: 'paint', 'stroke-width': 'p', 'stroke-linecap': ['butt', 'round', 'square'], 'stroke-linejoin': ['miter', 'round', 'bevel'],
    'stroke-dasharray': 'dash', 'fill-rule': ['nonzero', 'evenodd'], opacity: 'o', transform: 'matrix', title: 'str', class: 'class', 'aria-label': 'str', 'aria-hidden': 'bool',
};
const own = {
    rect: { x: 'n', y: 'n', width: 'p', height: 'p', rx: 'p', ry: 'p' },
    ellipse: { cx: 'n', cy: 'n', rx: 'p', ry: 'p' },
    line: { x1: 'n', y1: 'n', x2: 'n', y2: 'n' },
    polyline: { points: 'points' },
    polygon: { points: 'points' },
    path: { d: 'd' },
    text: { x: 'n', y: 'n', 'font-size': 'p', 'font-family': FONTS, 'text-anchor': ['start', 'middle', 'end'] },
    g: {},
};
/** type -> { attribute: kind }; the type's own geometry first, then the shared presentation attributes. Frozen. */
export const NODES = Object.freeze(Object.fromEntries(Object.entries(own).map(([t, a]) => [t, Object.freeze({ ...a, ...COMMON })])));
export const NODE_TYPES = Object.freeze(Object.keys(NODES));

const NUM = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)%?';
const FUNC = new RegExp(`^(?:rgb|hsl)a?\\(\\s*${NUM}(?:\\s*,\\s*${NUM}){2}(?:\\s*,\\s*${NUM})?\\s*\\)$`, 'i');
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const VAR = /^var\(--color-[a-z0-9-]{1,40}\)$/;
const URL_ID = /^url\(#([A-Za-z][\w-]{0,63})\)$/;
const NAMES = new Set(('none currentColor transparent black white gray grey silver red maroon orange yellow olive lime green aqua cyan teal blue navy fuchsia magenta purple pink brown gold').split(' '));
const CLASS = /^[A-Za-z_][\w-]{0,40}(?: [A-Za-z_][\w-]{0,40}){0,7}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f￾￿]/g;

/** True for a colour from the strict grammar: hex, rgb()/hsl() (comma form), a named colour, none, currentColor, var(--color-*), and url(#id) only when `ids` has the id. */
export function isPaint(v, ids = null) {
    if (typeof v !== 'string' || v.length > 80) return false;
    const u = URL_ID.exec(v);
    if (u) return Boolean(ids && ids.has(u[1]));
    return HEX.test(v) || FUNC.test(v) || NAMES.has(v) || VAR.test(v);
}

/** Text without the characters XML 1.0 forbids, cut to `max`; the second value says whether anything changed. */
export function cleanText(s, max) {
    const t = String(s).replace(CONTROL, '').slice(0, max);
    return [t, t !== s];
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const nums = (a, c) => a.every(Number.isFinite) ? a.map(v => clamp(v, -c, c)) : null;
const ARITY = { M: 2, L: 2, C: 6, Z: 0 };

/**
 * Checks one attribute value against its kind. Returns [ok, value]: ok false means refuse it; value is the clean form (numbers clamped, an identity
 * transform gives undefined, meaning "leave it out").
 */
export function cleanValue(kind, v, limits = LIMITS) {
    const c = limits.coord;
    switch (Array.isArray(kind) ? 'enum' : kind) {
        case 'n': return Number.isFinite(v) ? [true, clamp(v, -c, c)] : [false];
        case 'p': return Number.isFinite(v) ? [true, clamp(v, 0, c)] : [false];
        case 'o': return Number.isFinite(v) ? [true, clamp(v, 0, 1)] : [false];
        case 'paint': return isPaint(v) ? [true, v] : [false];
        case 'enum': return kind.includes(v) ? [true, v] : [false];
        case 'bool': return typeof v === 'boolean' ? [true, v] : [false];
        case 'class': return typeof v === 'string' && CLASS.test(v) ? [true, v] : [false];
        case 'str': {
            if (typeof v !== 'string') return [false];
            const [t, changed] = cleanText(v, limits.label);
            return changed ? [false] : [true, t];
        }
        case 'matrix': {
            if (!isMatrix(v)) return [false];
            const m = v.map(x => clamp(x, -c, c));
            return [true, isIdentity(m) ? undefined : m];
        }
        case 'points': {
            if (!Array.isArray(v) || v.length < 2 || v.length % 2 || v.length / 2 > limits.segments) return [false];
            const p = nums(v, c);
            return p ? [true, p] : [false];
        }
        case 'dash': {
            if (!Array.isArray(v) || !v.length || v.length > 8 || !v.every(x => Number.isFinite(x) && x >= 0)) return [false];
            return [true, v.map(x => Math.min(x, c))];
        }
        case 'd': {
            if (!Array.isArray(v) || !v.length || v.length > limits.segments || v[0]?.[0] !== 'M') return [false];
            const out = [];
            for (const s of v) {
                const cmd = Array.isArray(s) ? s[0] : null;
                if (!Object.hasOwn(ARITY, cmd) || s.length !== ARITY[cmd] + 1) return [false];
                const args = nums(s.slice(1), c);
                if (!args) return [false];
                out.push([cmd, ...args]);
            }
            return [true, out];
        }
        default: return [false];
    }
}
