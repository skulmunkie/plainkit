// The custom SDK, breakpoints half (split from custom-sdk-logic.js, #1108): parse and resolve the named breakpoints, validate the widths a consumer chose, rewrite the widths
// in the shipped files, and describe what a change moves (the delta table). Pure text in, text out; no imports. custom-sdk-logic.js re-exports all of it.
// ---- named breakpoints (moved here from tools/breakpoints.mjs, which re-exports them for the build)

/** Validates a name -> width object: names are lowercase letters and digits (no hyphen, so `above-` is unambiguous), widths are integers, ascending. Returns [{ name, width }]. */
export function parseBreakpoints(obj) {
    const entries = Object.entries(obj ?? {});
    if (!entries.length) throw new Error('breakpoints: at least one breakpoint is required');
    let last = 0;
    return entries.map(([name, width]) => {
        if (!/^[a-z][a-z0-9]*$/.test(name)) throw new Error(`breakpoints: "${name}" is not a valid name (lowercase letters and digits, starting with a letter)`);
        if (!Number.isInteger(width) || width <= last) throw new Error(`breakpoints: "${name}" is ${width}; widths are integer px and must ascend (after ${last})`);
        last = width;
        return { name, width };
    });
}

/** name -> the media condition it stands for: `phone` -> (max-width: 640px), `above-phone` -> (min-width: 641px). */
export function conditionMap(bps) {
    const map = new Map();
    for (const { name, width } of bps) { map.set(name, `(max-width: ${width}px)`); map.set(`above-${name}`, `(min-width: ${width + 1}px)`); }
    return map;
}

// A comment, or the condition of an @media rule (up to its block).
const SCAN = /\/\*[\s\S]*?\*\/|(@media)([^{;]*)\{/g;

/** Replaces every `(--name)` inside an @media condition with its query; whitespace is kept. `file` only names the source in the error. */
export function resolveCustomMedia(css, bps, file = 'css') {
    const map = conditionMap(bps);
    return css.replace(SCAN, (whole, at, cond, offset) => {
        if (!at) return whole;
        const line = css.slice(0, offset).split('\n').length;
        const resolved = cond.replace(/\(\s*--([A-Za-z0-9-]+)\s*\)/g, (_m, name) => {
            const q = map.get(name);
            if (!q) throw new Error(`${file}:${line}: unknown breakpoint "--${name}" in @media; known: ${[...map.keys()].map(k => `--${k}`).join(', ')} (tokens/breakpoints.json)`);
            return q;
        });
        return `@media${resolved}{`;
    });
}

/** The widths as custom properties, one rule: `:root{--pk-bp-phone:640px;...}` (compact; the page layer is size-budgeted). */
export const breakpointProperties = bps => `:root{${bps.map(b => `--pk-bp-${b.name}:${b.width}px`).join(';')}}`;

// ---- the settings a consumer chooses

export const RANGE = Object.freeze({ min: 320, max: 2560, gap: 64 });

/** Checks the widths a consumer typed: { ok, widths: { name: n }, problems: [{ name, message }] }. `names` are the breakpoints of the SDK, in order (phone, tablet, wide). */
export function validateBreakpoints(input, names) {
    const problems = []; const widths = {};
    let last = null;
    for (const name of names) {
        const raw = input?.[name];
        const text = String(raw ?? '').trim();
        const n = Number(text);
        if (!text || !Number.isInteger(n)) { problems.push({ name, message: `${name} must be a whole number of pixels` }); last = null; continue; }
        widths[name] = n;
        if (n < RANGE.min || n > RANGE.max) problems.push({ name, message: `${name} must be between ${RANGE.min} and ${RANGE.max} px` });
        else if (last !== null && n <= last) problems.push({ name, message: `${name} must be wider than the breakpoint before it (${last} px)` });
        else if (last !== null && n - last < RANGE.gap) problems.push({ name, message: `${name} must be at least ${RANGE.gap} px wider than the one before it (${last} px)` });
        last = n;
    }
    return { ok: problems.length === 0, widths, problems };
}

/** The widths a page ships, read from the --pk-bp-* block of its plainkit.css: { phone: 640, ... } in file order. */
export function readShippedBreakpoints(pageCss) {
    const out = {};
    for (const m of String(pageCss).matchAll(/--pk-bp-([a-z][a-z0-9]*)\s*:\s*(\d+)px/g)) if (!(m[1] in out)) out[m[1]] = Number(m[2]);
    return out;
}

export const sameWidths = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k]);

// ---- the width rewrite

const WIDTH = /(\(\s*)(max|min)(-width\s*:\s*)(\d+)(px\s*\))/g;

/**
 * Rewrites the widths in the @media conditions of a text: from = { name: old }, to = { name: new }. `(max-width: old)` becomes new, `(min-width: old + 1)` becomes
 * new + 1. One pass over the text, so a new width equal to another old one is never rewritten twice. Returns { text, counts: { name: n }, unhandled: [condition] }:
 * `unhandled` lists a condition that mentions a shipped width in a form this cannot rewrite (a range query, em units), which the caller must treat as an error.
 * `comments` is true for a stylesheet (a comment is skipped) and false for a script that carries CSS in a string.
 */
export function rewriteMedia(text, from, to, { comments = true } = {}) {
    const byOld = new Map(Object.entries(from).filter(([n]) => n in to).map(([n, w]) => [w, n]));
    const counts = Object.fromEntries(Object.keys(from).map(n => [n, 0]));
    const unhandled = [];
    const scan = comments ? SCAN : /(@media)([^{;]*)\{/g;
    const result = text.replace(scan, (whole, at, cond) => {
        if (!at) return whole;
        const next = cond.replace(WIDTH, (m, a, dir, b, digits, c) => {
            const px = Number(digits);
            const name = byOld.get(dir === 'max' ? px : px - 1);
            if (!name) return m;
            counts[name]++;
            return `${a}${dir}${b}${to[name] + (dir === 'max' ? 0 : 1)}${c}`;
        });
        const rest = cond.replace(WIDTH, '');
        if (/width/.test(rest) &&[...byOld.keys()].some(w => new RegExp(`\\b(?:${w}|${w + 1})(?:px)?\\b`).test(rest))) unhandled.push(cond.trim());
        return `@media${next}{`;
    });
    return { text: result, counts, unhandled };
}

/** Rewrites the --pk-bp-* custom properties (the block on :root in plainkit.css): { text, count }. */
export function rewriteProperties(text, to) {
    let count = 0;
    const result = text.replace(/(--pk-bp-)([a-z][a-z0-9]*)(\s*:\s*)(\d+)(px)/g, (m, a, name, b, _w, c) => { if (!(name in to)) return m; count++; return `${a}${name}${b}${to[name]}${c}`; });
    return { text: result, count };
}

/** The breakpoints report (dist/breakpoints.report.json) with the widths replaced, so the export describes itself. */
export function reportWithWidths(report, to) {
    const next = { ...report, breakpoints: report.breakpoints.map(b => ({ ...b, width: to[b.name] ?? b.width })), byBreakpoint: { ...report.byBreakpoint } };
    for (const b of next.breakpoints) next.byBreakpoint[b.name] = { ...report.byBreakpoint[b.name], width: b.width };
    return next;
}

// ---- the delta table

/**
 * What a change of widths moves, from the shipped report (dist/breakpoints.report.json): one row per breakpoint with the elements and properties that change there and
 * the viewport widths whose state flips (between the old and the new width). rows[i] = { name, from, to, changed, flips: [lo, hi] | null, elements: [{ element, below, above }], rules }.
 */
export function deltaRows(report, to) {
    return report.breakpoints.map(b => {
        const slot = report.byBreakpoint[b.name];
        const now = to[b.name] ?? b.width;
        const props = list => [...new Set(list.flatMap(r => r.properties))].sort();
        const elements = Object.entries(slot.elements).map(([element, d]) => ({ element, below: props(d.below), above: props(d.above) }));
        const lo = Math.min(b.width, now) + 1; const hi = Math.max(b.width, now);
        return { name: b.name, from: b.width, to: now, changed: now !== b.width, flips: now === b.width ? null : [lo, hi], elements, rules: slot.ruleCount };
    });
}
