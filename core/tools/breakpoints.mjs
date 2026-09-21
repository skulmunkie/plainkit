// Named breakpoints, resolved at build time. Dependency-free.
//
// The one source is tokens/breakpoints.json: names and widths in px, ascending (phone 640, tablet 1024, wide 1280). CSS custom properties cannot be
// used inside @media, so element CSS names a breakpoint and the build writes the real query into the generated module (zero runtime cost):
//
//   @media (--phone)            ->  @media (max-width: 640px)       width <= the breakpoint (the codebase is desktop-first)
//   @media (--above-phone)      ->  @media (min-width: 641px)       the complement: width > the breakpoint
//
// Only a parenthesised name inside an @media condition is replaced, so it combines like any feature:
//   @media (--phone) and (orientation: portrait)      @media (pointer: coarse), (--phone)      @media (--above-phone) and (--tablet)   (a band)
// An unknown name is a build error that lists the known names. Comments are left alone. Nothing else in the CSS is touched.
//
// CSS that a page loads straight from the source tree (tokens, base, site, module and sample CSS) is not built, so it cannot use a name: it writes the
// literal query with the same width, and tests/breakpoints.test.mjs fails when a literal is not one of these widths.
//
// The build also writes the widths as custom properties (--pk-bp-phone: 640px, ...) for js/breakpoints.js and for documentation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BREAKPOINTS_FILE = path.join(here, '..', 'tokens', 'breakpoints.json');

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

export const loadBreakpoints = (file = BREAKPOINTS_FILE) => parseBreakpoints(JSON.parse(fs.readFileSync(file, 'utf8')));

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
