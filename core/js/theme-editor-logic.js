// The theme editor's pure logic (modules/theme-editor): which tokens to list, how an edit lands in the override dictionaries, which
// contrast pairs fail, what an element target gets as inline properties. No DOM; imports only the SDK's theme and colour maths.

import { tokenKind, splitLength, nameProblem, valueProblem, parseOverrides } from './theme.js';
import { contrast, grade } from './colour.js';

export const KINDS = Object.freeze(['all', 'colour', 'font', 'size', 'shadow', 'layer', 'other']);
export const MIN_CONTRAST = 4.5;

// Text on background pairs the editor grades by default: body and muted text, links and accent, on the page and panel surfaces.
export const DEFAULT_PAIRS = Object.freeze([
    ['--color-text', '--color-bg'], ['--color-text', '--color-panel'], ['--color-muted', '--color-bg'],
    ['--color-muted', '--color-panel'], ['--color-link', '--color-panel'], ['--color-accent', '--color-panel'],
].map(p => Object.freeze(p)));

// The units the length editor (pk-unit-input) offers, in the select's format.
export const LENGTH_UNITS = 'px rem em %';

// Whether a token is edited as a number and a unit: a size token whose value in force is a plain length in one of LENGTH_UNITS (1.5rem, 44px, 50%).
// Anything else (var(...), calc(...), clamp(...), a bare number) stays a text field, as does every other kind of token.
export function isLengthToken(name, value) {
    if (tokenKind(name, value) !== 'size') return false;
    const length = splitLength(value);
    return Boolean(length?.unit) && LENGTH_UNITS.split(' ').includes(length.unit);
}

export const emptyOverrides = () => ({ shared: {}, dark: {}, light: {} });

// Every token name the stylesheet declares, sorted.
export const allTokenNames = tokens => [...new Set([...Object.keys(tokens.dark), ...Object.keys(tokens.light), ...Object.keys(tokens.root)])].sort();

// The value the stylesheet gives a token in a theme (that theme's block, else the theme-independent one, else the dark block).
export const baseValue = (tokens, theme, name) => tokens[theme]?.[name] ?? tokens.root[name] ?? tokens.dark[name] ?? '';

export const isChanged = (overrides, theme, name) => name in overrides[theme] || name in overrides.shared;

// The value in force: this theme's override, else the shared one, else the stylesheet's.
export const effectiveValue = (overrides, tokens, theme, name) => overrides[theme][name] ?? overrides.shared[name] ?? baseValue(tokens, theme, name);

// The tokens to list for a kind and a name filter (substring, any case).
export function visibleTokens(tokens, theme, { kind = 'all', filter = '' } = {}) {
    const f = String(filter).trim().toLowerCase();
    return allTokenNames(tokens).filter(n => (kind === 'all' || tokenKind(n, baseValue(tokens, theme, n)) === kind) && n.includes(f));
}

// A copy of the overrides with one edit applied. scope 'both' writes the shared dictionary (and clears the theme's own entry so the
// shared value shows); 'theme' writes the current theme's. An empty value, or the stylesheet's own value, removes the entry.
export function withEdit(overrides, { theme, scope = 'theme', name, value, base }) {
    const next = { shared: { ...overrides.shared }, dark: { ...overrides.dark }, light: { ...overrides.light } };
    const dict = scope === 'both' ? next.shared : next[theme];
    if (value === '' || value === base) delete dict[name]; else dict[name] = value;
    if (scope === 'both') delete next[theme][name];
    return next;
}

// A copy with one token cleared everywhere.
export function withoutToken(overrides, name) {
    const next = { shared: { ...overrides.shared }, dark: { ...overrides.dark }, light: { ...overrides.light } };
    delete next.shared[name]; delete next.dark[name]; delete next.light[name];
    return next;
}

export const overrideCount = o => Object.keys(o.shared).length + Object.keys(o.dark).length + Object.keys(o.light).length;

// Contrast of each pair. read(name) gives the token's computed value; a value that is not a literal colour (var(), color-mix()) has ratio null.
export function evaluatePairs(pairs, read, min = MIN_CONTRAST) {
    return pairs.map(([fg, bg]) => {
        const ratio = contrast(read(fg), read(bg));
        return { fg, bg, ratio, bad: ratio !== null && ratio < min, grade: grade(ratio, { aaa: 7, aa: min }) };
    });
}

// What an element target receives for a theme: the shared overrides under the theme's own, only names and values the SDK's rules accept.
export function inlineEntries(overrides, theme) {
    const out = {};
    for (const [name, value] of Object.entries({ ...overrides.shared, ...overrides[theme] })) if (!nameProblem(name) && !valueProblem(value)) out[name] = String(value).trim();
    return out;
}

// Reads text the user pasted into the import box. Returns { overrides } when it is a JSON { shared, dark, light } or an override CSS block that
// holds at least one usable token, or { error } (a sentence for the status line) otherwise, so the caller keeps the current overrides. JSON
// with a section key and nothing in it ({"shared":{}}) is a valid way to clear; text that is neither JSON nor CSS, or whose tokens the SDK's
// rules all reject, is an error and never clears anything.
export function readImport(text) {
    const t = String(text ?? '').trim();
    if (!t) return { error: 'Nothing to import: paste JSON or an override CSS block first.' };
    const json = t.startsWith('{') && !t.includes('[data-theme') && !t.includes(':root');
    const parsed = parseOverrides(t);
    if (!parsed) return { error: 'Not JSON and not an override CSS block.' };
    const count = overrideCount(parsed);
    if (json) {
        const raw = JSON.parse(t);
        const sections = ['shared', 'dark', 'light'].filter(k => raw !== null && typeof raw === 'object' && k in raw);
        if (!sections.length) return { error: 'The JSON has none of "shared", "dark" or "light".' };
        const given = sections.reduce((n, k) => n + (raw[k] !== null && typeof raw[k] === 'object' ? Object.keys(raw[k]).length : 0), 0);
        if (given > 0 && count === 0) return { error: 'None of the tokens in the JSON are allowed (a name must start with -- and a value must be safe).' };
        return { overrides: parsed };
    }
    if (count === 0) return { error: 'Not JSON and not an override CSS block: no token declarations were found.' };
    return { overrides: parsed };
}
