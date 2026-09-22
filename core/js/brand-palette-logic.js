// The theme editor's brand palette generator (modules/theme-editor): from one brand colour (and optionally a neutral and a warn colour) it derives
// the accent, fill, hover and link colours and the surface and text ramps of BOTH themes so that every pair in AA_PAIRS meets 4.5:1. Pure: no DOM.
//
//   const p = generatePalette('#e11d74');   // { overrides: { shared, dark, light }, brand, moved, notes, error? }
//   applyPalette(currentOverrides, p.overrides, tokens);   // ordinary edits the user can still change
//   paletteRows(p.overrides, tokens);                      // [{ theme, fg, bg, fgValue, bgValue, ratio, grade }] for every pair
//
// How: every colour is chosen in HSL (hue and saturation kept from the brand, lightness searched in 0.5% steps from where the brand sits, towards
// the side the theme needs) and accepted only when the rounded hex meets the goal on every surface it can sit on. In each direction contrast
// rises monotonically to black or white, so a passing value always exists. When the brand colour itself cannot be used as text or as a fill it is
// moved, and `moved` and `notes` say so, with the ratio it reached. Nothing is ever emitted below AA.

import { parseColour, contrast } from './colour.js';
import { AA_PAIRS, MIN_CONTRAST, emptyOverrides, withEdit, baseValue, auditPairs } from './theme-editor-logic.js';

export { AA_PAIRS };

const GOAL = MIN_CONTRAST;   // checked on the rounded hex that is emitted, so the ratio the user sees is the one that was tested
const STEP = 0.005;
const WHITE = '#ffffff';
const SURFACES = ['bg', 'panel', 'flyout', 'surface', 'alt'];
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function toHsl({ r, g, b }) {
    const [R, G, B] = [r, g, b].map(v => v / 255);
    const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min, l = (max + min) / 2;
    if (d === 0) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    return { h: h * 60, s, l };
}

export function hslToHex(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return `#${[r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

// A colour text as "#rrggbb" (alpha ignored), or null.
export function normalizeColour(text) {
    const c = parseColour(text);
    if (!c) return null;
    return `#${[c.r, c.g, c.b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

// Walks lightness from `from` in `dir` (+1 lighter, -1 darker) until ok(hex) holds. Returns { hex, moved }: moved is whether it had to leave `from`.
function fit(h, s, from, dir, ok) {
    let last = hslToHex(h, s, clamp(from));
    for (let i = 0; i <= 1 / STEP; i++) {
        const l = clamp(from + dir * i * STEP);
        last = hslToHex(h, s, l);
        if (ok(last)) return { hex: last, moved: i > 0 };
        if (i > 0 && (l === 0 || l === 1)) break;
    }
    return { hex: last, moved: true };
}

const onAll = (surfaces, goal = GOAL) => c => surfaces.every(bg => contrast(c, bg) >= goal);
const onWhite = c => contrast(WHITE, c) >= GOAL;
const shift = (h, s, hex, by) => hslToHex(h, s, clamp(toHsl(parseColour(hex)).l + by));

function surfaces(theme, nh, ns) {
    const l = theme === 'dark' ? [0.11, 0.16, 0.21, 0.23, 0.2] : [0.98, 1, 1, 1, 0.955];
    return Object.fromEntries(SURFACES.map((k, i) => [k, hslToHex(nh, ns, l[i])]));
}

// Options: neutral (a colour whose hue tints the surfaces and text; default the brand's), warn (a colour for the warn button and its hover).
// Returns { brand, overrides, moved, notes } or { error } when the brand is not a colour this can read (#rgb, #rrggbb, rgb()).
export function generatePalette(brandText, options = {}) {
    const brandHex = normalizeColour(brandText);
    if (!brandHex) return { error: 'Enter a colour like #4a90e2.' };
    const brand = toHsl(parseColour(brandHex));
    const tint = options.neutral ? normalizeColour(options.neutral) : null;
    if (options.neutral && !tint) return { error: 'The neutral colour is not one this can read.' };
    const neutral = toHsl(parseColour(tint ?? brandHex));
    const ns = Math.min(neutral.s, 0.16);
    const notes = [];
    const overrides = emptyOverrides();
    const put = (theme, name, value) => { overrides[theme][name] = value; };

    for (const theme of ['dark', 'light']) {
        const dark = theme === 'dark';
        const s = surfaces(theme, neutral.h, ns);
        const all = Object.values(s);
        const on = onAll(all);
        put(theme, '--color-bg', s.bg); put(theme, '--color-panel', s.panel); put(theme, '--color-flyout', s.flyout);
        put(theme, '--color-input', s.surface); put(theme, '--color-surface', s.surface); put(theme, '--color-surface-alt', s.alt);
        put(theme, '--color-input-border', hslToHex(neutral.h, ns, dark ? 0.31 : 0.83)); put(theme, '--color-border', hslToHex(neutral.h, ns, dark ? 0.23 : 0.87));
        put(theme, '--color-text', fit(neutral.h, ns * 0.5, dark ? 0.91 : 0.13, dark ? 1 : -1, onAll(all, 7)).hex);
        put(theme, '--color-muted', fit(neutral.h, ns * 0.6, dark ? 0.62 : 0.42, dark ? 1 : -1, on).hex);

        const dir = dark ? 1 : -1;
        const accent = fit(brand.h, brand.s, brand.l, dir, on);
        const link = fit(brand.h, brand.s, toHsl(parseColour(accent.hex)).l + (dark ? 0.04 : 0), dir, on);
        put(theme, '--color-accent', accent.hex);
        put(theme, '--color-accent-hover', fit(brand.h, brand.s, toHsl(parseColour(accent.hex)).l + (dark ? 0.05 : -0.06), dir, on).hex);
        put(theme, '--color-link', link.hex);
        put(theme, '--color-link-hover', fit(brand.h, brand.s, toHsl(parseColour(link.hex)).l + (dark ? 0.04 : -0.06), dir, on).hex);
        // The fill sits behind white text, so it darkens (in both themes) until white on it, and on its hover, passes.
        const fill = fit(brand.h, brand.s, brand.l, -1, c => onWhite(c) && onWhite(shift(brand.h, brand.s, c, -0.04)));
        put(theme, '--color-accent-fill', fill.hex);
        put(theme, '--color-accent-fill-hover', shift(brand.h, brand.s, fill.hex, -0.04));
        if (accent.moved) notes.push(`${theme}: ${brandHex} is ${contrast(brandHex, s.panel).toFixed(2)}:1 on the ${theme} panel, so the accent and links move to ${accent.hex} (${contrast(accent.hex, s.panel).toFixed(2)}:1).`);
        if (fill.moved) notes.push(`${theme}: white on ${brandHex} is ${contrast(WHITE, brandHex).toFixed(2)}:1, so the button fill moves to ${fill.hex} (${contrast(WHITE, fill.hex).toFixed(2)}:1).`);
    }

    if (options.warn) {
        const w = normalizeColour(options.warn);
        if (!w) return { error: 'The warn colour is not one this can read.' };
        const warn = toHsl(parseColour(w));
        const fill = fit(warn.h, warn.s, warn.l, -1, c => onWhite(c) && onWhite(shift(warn.h, warn.s, c, -0.03)));
        const hover = shift(warn.h, warn.s, fill.hex, -0.03);
        for (const [name, value] of [['--btn-warn-bg', fill.hex], ['--btn-warn-hover-bg', hover], ['--btn-mini-btn-warn-bg', fill.hex], ['--btn-mini-btn-warn-hover-bg', hover]]) overrides.shared[name] = value;
        if (fill.moved) notes.push(`warn: white on ${w} is ${contrast(WHITE, w).toFixed(2)}:1, so the warn button moves to ${fill.hex} (${contrast(WHITE, fill.hex).toFixed(2)}:1).`);
    }
    return { brand: brandHex, overrides, moved: notes.length > 0, notes };
}

// The result written as ordinary edits on top of the current ones (a token equal to the stylesheet's own value leaves no override).
export function applyPalette(current, generated, tokens) {
    let next = current;
    for (const theme of ['dark', 'light']) for (const [name, value] of Object.entries(generated[theme])) next = withEdit(next, { theme, scope: 'theme', name, value, base: baseValue(tokens, theme, name) });
    for (const [name, value] of Object.entries(generated.shared)) next = withEdit(next, { theme: 'dark', scope: 'both', name, value, base: baseValue(tokens, 'dark', name) });
    return next;
}

// Every AA pair in both themes with the colours it would have under `overrides` (the generated palette over the stylesheet): the swatches and ratios.
export const paletteRows = (overrides, tokens, pairs = AA_PAIRS) => auditPairs(overrides, tokens, pairs);
