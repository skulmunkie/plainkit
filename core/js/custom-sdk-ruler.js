// The custom SDK, ruler half (#124 step 5): breakpoints of your own beside the SDK's three, the device presets they start from, the page-level responsive utility classes written for
// them, and the "found the expected number of times" check every rewrite of the shipped source goes through. Pure text and numbers in, text and numbers out; no DOM.
import { RANGE } from './custom-sdk-breakpoints.js';

/** Device widths to start from: { name, label, width }. A name is a lowercase word (the same rule as the SDK's: no hyphen). */
export const DEVICE_PRESETS = Object.freeze([
    { name: 'compact', label: 'Large phone', width: 480 },
    { name: 'slate', label: 'Tablet, portrait', width: 768 },
    { name: 'laptop', label: 'Laptop', width: 1366 },
    { name: 'desktop', label: 'Desktop', width: 1536 },
    { name: 'ultrawide', label: 'Ultrawide', width: 1920 },
]);

/**
 * Checks the breakpoints of your own against the SDK's: input = [{ name, width }] (width a number or the text typed), base = { phone: 640, ... } (the widths the export uses).
 * Names are unique, valid and not the SDK's; widths are whole pixels in RANGE and at least RANGE.gap from every other breakpoint (the SDK's included). Returns
 * { ok, extras: [{ name, width }] sorted by width, problems: [{ name, message }] }; `extras` holds only the entries without a problem.
 */
export function validateExtras(input, base) {
    const problems = []; const good = [];
    const seen = new Set(Object.keys(base));
    const widths = Object.values(base);
    for (const row of input ?? []) {
        const name = String(row?.name ?? '').trim(); const text = String(row?.width ?? '').trim(); const n = Number(text);
        const bad = message => problems.push({ name: name || '(unnamed)', message });
        if (!/^[a-z][a-z0-9]*$/.test(name)) { bad(`"${name}" is not a valid name (lowercase letters and digits, starting with a letter)`); continue; }
        if (seen.has(name)) { bad(`${name} is already a breakpoint`); continue; }
        seen.add(name);
        if (!text || !Number.isInteger(n)) { bad(`${name} must be a whole number of pixels`); continue; }
        if (n < RANGE.min || n > RANGE.max) { bad(`${name} must be between ${RANGE.min} and ${RANGE.max} px`); continue; }
        const near = widths.find(w => Math.abs(w - n) < RANGE.gap);
        if (near !== undefined) { bad(`${name} must be at least ${RANGE.gap} px from the breakpoint at ${near} px`); continue; }
        widths.push(n); good.push({ name, width: n });
    }
    return { ok: problems.length === 0, extras: good.sort((a, b) => a.width - b.width), problems };
}

/** The list with one entry added (a preset or { name, width }), renamed or removed: each returns { list } or { error }, never changes its argument. */
export const addExtra = (list, entry) => (list.some(e => e.name === entry.name) ? { error: `${entry.name} is already in the list` } : { list: [...list, { name: entry.name, width: entry.width }] });
export const renameExtra = (list, from, to) => (list.some(e => e.name === to) ? { error: `${to} is already in the list` } : { list: list.map(e => (e.name === from ? { ...e, name: to } : e)) });
export const removeExtra = (list, name) => ({ list: list.filter(e => e.name !== name) });

/** The ruler as data: every breakpoint (the SDK's and yours), narrowest first. */
export function rulerMarks(base, extras) {
    const all = [...Object.entries(base).map(([name, width]) => ({ name, width, own: false })), ...extras.map(e => ({ ...e, own: true }))];
    return all.sort((a, b) => a.width - b.width);
}

/**
 * The stylesheet for the breakpoints of your own, the same two attributes the page layer has for the SDK's (`data-show-above`, `data-hide-above`): `data-show-above="name"` hides at
 * and below the width, `data-hide-above="name"` hides above it. Empty text for no breakpoints. The widths are re-checked, so a bad entry throws instead of writing a wrong rule.
 */
export function responsiveCss(extras) {
    if (!extras.length) return '';
    const rules = extras.flatMap(({ name, width }) => {
        if (!/^[a-z][a-z0-9]*$/.test(name) || !Number.isInteger(width)) throw new Error(`responsive utilities: "${name}" ${width} is not a valid breakpoint`);
        return [`@media (max-width: ${width}px) { [data-show-above="${name}"] { display: none !important; } }`, `@media (min-width: ${width + 1}px) { [data-hide-above="${name}"] { display: none !important; } }`];
    });
    const css = `/* Responsive utilities for ${extras.map(e => `${e.name} ${e.width}px`).join(', ')}. Load after plainkit.css. */\n${rules.join('\n')}\n`;
    expectCount('the responsive utility stylesheet', (css.match(/@media/g) ?? []).length, extras.length * 2);
    return css;
}

/** A rewrite that finds its target a different number of times than expected is an error, never a quiet wrong build. */
export function expectCount(what, found, expected) {
    if (found !== expected) throw new Error(`${what}: found ${found} time${found === 1 ? '' : 's'}, expected ${expected}; nothing was exported (the source is not the release this export was written for)`);
}

/** How many times the shipped text holds the media queries of a width that changes: `(max-width: Npx)` and `(min-width: N+1px)`, counted over the whole text (not only @media), so a query a rewrite would leave behind is seen. */
export const queryCount = (text, w) => (text.match(new RegExp(`\\(\\s*max-width\\s*:\\s*${w}\\s*px\\s*\\)|\\(\\s*min-width\\s*:\\s*${w + 1}\\s*px\\s*\\)`, 'g')) ?? []).length;

/** How many times the page layer declares the --pk-bp-<name> property: the one block on :root, so 0 or 1 per file. */
export const propertyCount = (text, name) => (text.match(new RegExp(`--pk-bp-${name}\\s*:\\s*\\d+px`, 'g')) ?? []).length;
