// The theme editor's presets and saved themes (modules/theme-editor). Pure: no DOM, no storage (the module reads and writes localStorage, wrapped in
// try/catch, and hands the text to readSaved).
//
//   PRESETS: built-in starting points, each { id, name, description, overrides: { shared, dark, light } }: the stylesheet's own theme, a high-contrast
//   one (text and surfaces at 7:1 or better, stronger borders and focus colours) and a compact and a roomy density.
//   readSaved(raw) / saveTheme(list, name, overrides) / renameTheme(list, from, to) / deleteTheme(list, name): the user's named themes, as plain lists.
//
// Every override name and value passes the SDK's rules (js/theme.js); the saved list is sanitised on the way in, capped, and never trusted as HTML.

import { sanitizeOverrides, sanitizeDict } from './theme.js';
import { emptyOverrides, readImport } from './theme-editor-logic.js';

export const MAX_SAVED = 30;
export const MAX_NAME = 40;
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _.,'()-]*$/u;

const preset = (id, name, description, overrides) => Object.freeze({ id, name, description, overrides: Object.freeze({ ...emptyOverrides(), ...overrides }) });

export const PRESETS = Object.freeze([
    preset('default', 'Default', 'The stylesheet as shipped: no overrides.', {}),
    preset('high-contrast', 'High contrast', 'Text and surfaces at 7:1 or better in both themes, strong borders, darker accent and warn fills.', {
        shared: { '--btn-warn-bg': '#8a3f00', '--btn-warn-hover-bg': '#6f3200', '--btn-mini-btn-warn-bg': '#8a3f00', '--btn-mini-btn-warn-hover-bg': '#6f3200' },
        dark: {
            '--color-bg': '#000000', '--color-panel': '#0a0a0a', '--color-flyout': '#141414', '--color-input': '#141414', '--color-surface': '#1a1a1a', '--color-surface-alt': '#101010',
            '--color-text': '#ffffff', '--color-muted': '#d4d4d4', '--color-border': '#8c8c8c', '--color-input-border': '#b0b0b0',
            '--color-accent': '#8ec5ff', '--color-accent-hover': '#b0d6ff', '--color-link': '#9fd0ff', '--color-link-hover': '#c2e0ff',
            '--color-accent-fill': '#0b4fa8', '--color-accent-fill-hover': '#083d82',
        },
        light: {
            '--color-bg': '#ffffff', '--color-panel': '#ffffff', '--color-flyout': '#ffffff', '--color-input': '#ffffff', '--color-surface': '#ffffff', '--color-surface-alt': '#f0f0f0',
            '--color-text': '#000000', '--color-muted': '#3a3a3a', '--color-border': '#5a5a5a', '--color-input-border': '#3a3a3a',
            '--color-accent': '#0a3a9e', '--color-accent-hover': '#082d7d', '--color-link': '#0a3a9e', '--color-link-hover': '#082d7d',
            '--color-accent-fill': '#0a3a9e', '--color-accent-fill-hover': '#082d7d',
        },
    }),
    preset('compact', 'Compact density', 'Tighter gaps and padding for data-heavy screens (the scale\'s compact roles).', {
        shared: {
            '--gap-field': 'var(--space-3)', '--gap-control': 'var(--space-1)', '--gap-heading': 'var(--space-1)', '--gap-card': 'var(--space-3)', '--gap-section': 'var(--space-4)', '--flow-space': 'var(--space-3)',
            '--pad-card': 'var(--space-3) var(--space-4)', '--pad-panel': 'var(--space-3)', '--pad-form-section': 'var(--space-3)', '--pad-modal': 'var(--space-3) var(--space-4)',
            '--pad-drawer': 'var(--space-3) var(--space-4)', '--pad-cell': 'var(--space-1) var(--space-2)', '--pad-page': 'var(--space-4)',
        },
    }),
    preset('roomy', 'Roomy density', 'Looser gaps and padding for reading and touch.', {
        shared: {
            '--gap-field': 'var(--space-5)', '--gap-control': 'var(--space-3)', '--gap-heading': 'var(--space-3)', '--gap-card': 'var(--space-6)', '--gap-section': 'var(--space-8)', '--flow-space': 'var(--space-5)',
            '--pad-card': 'var(--space-5) var(--space-6)', '--pad-panel': 'var(--space-5)', '--pad-form-section': 'var(--space-5)', '--pad-modal': 'var(--space-5) var(--space-8)',
            '--pad-drawer': 'var(--space-5) var(--space-6)', '--pad-cell': 'var(--space-3) var(--space-4)', '--pad-page': 'var(--space-8)',
        },
    }),
]);

export const presetById = id => PRESETS.find(p => p.id === id) ?? null;

// A copy of a preset's overrides that the caller may change.
export const presetOverrides = id => {
    const p = presetById(id);
    return p ? { shared: { ...p.overrides.shared }, dark: { ...p.overrides.dark }, light: { ...p.overrides.light } } : null;
};

// The name as it is kept (trimmed, inner spaces collapsed) or null when it is not one: 1 to MAX_NAME letters, digits, spaces and _ . , ' ( ) -.
export function cleanName(text) {
    const n = String(text ?? '').replace(/\s+/g, ' ').trim();
    return n.length >= 1 && n.length <= MAX_NAME && NAME.test(n) ? n : null;
}

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// Parses the stored text into [{ name, overrides }]: a bad text, an entry with a bad name or a duplicate is dropped, the rest sanitised and capped.
export function readSaved(raw) {
    let parsed;
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }   // unreadable text is "no saved themes": the caller logs the storage failure, not a parse of user text
    if (!Array.isArray(parsed)) return [];
    const list = [];
    for (const item of parsed) {
        const name = cleanName(item?.name);
        if (!name || list.some(t => same(t.name, name))) continue;
        list.push({ name, overrides: sanitizeOverrides(item.overrides) });
        if (list.length >= MAX_SAVED) break;
    }
    return list;
}

export const serializeSaved = list => JSON.stringify(list.map(t => ({ name: t.name, overrides: t.overrides })));

const copy = o => ({ shared: { ...sanitizeDict(o.shared) }, dark: { ...sanitizeDict(o.dark) }, light: { ...sanitizeDict(o.light) } });

// { list } with the theme saved under the name (an existing name in any case is replaced), or { error }.
export function saveTheme(list, nameText, overrides) {
    const name = cleanName(nameText);
    if (!name) return { error: `A name is 1 to ${MAX_NAME} characters: letters, digits, spaces and _ . , ' ( ) -.` };
    const at = list.findIndex(t => same(t.name, name));
    if (at < 0 && list.length >= MAX_SAVED) return { error: `At most ${MAX_SAVED} saved themes: delete one first.` };
    const entry = { name, overrides: copy(overrides) };
    return { list: at < 0 ? [...list, entry] : list.map((t, i) => (i === at ? entry : t)), replaced: at >= 0 };
}

export function renameTheme(list, from, toText) {
    const to = cleanName(toText);
    if (!to) return { error: `A name is 1 to ${MAX_NAME} characters: letters, digits, spaces and _ . , ' ( ) -.` };
    if (!list.some(t => t.name === from)) return { error: `No saved theme called ${from}.` };
    if (list.some(t => t.name !== from && same(t.name, to))) return { error: `A saved theme is already called ${to}.` };
    return { list: list.map(t => (t.name === from ? { ...t, name: to } : t)) };
}

export const deleteTheme = (list, name) => list.filter(t => t.name !== name);

// Presets an app supplies: [{ name, description?, theme }], theme being the JSON { shared, dark, light } or an override CSS block (text) or the overrides object.
// Returns { presets: [{ id, name, description, overrides }], problems: [sentence] }: the id is the name; a bad, duplicate or built-in-named entry is left out with a sentence.
export function readCustomPresets(list) {
    const presets = [];
    const problems = [];
    for (const item of Array.isArray(list) ? list : []) {
        const name = cleanName(item?.name);
        if (!name) { problems.push(`A preset needs a name of 1 to ${MAX_NAME} characters (letters, digits, spaces and _ . , ' ( ) -).`); continue; }
        if (PRESETS.some(p => same(p.id, name)) || presets.some(p => same(p.id, name))) { problems.push(`The preset name "${name}" is already taken.`); continue; }
        const read = readOverridesInput(item.theme);
        if (read.error) { problems.push(`The preset "${name}" was left out: ${read.error}`); continue; }
        presets.push({ id: name, name, description: typeof item.description === 'string' ? item.description.slice(0, 200) : 'Supplied by the app.', overrides: read.overrides });
    }
    return { presets, problems };
}

// The overrides in text (JSON or CSS, read like an import) or in an object: { overrides } or { error }. Text that holds nothing usable is an error.
export function readOverridesInput(input) {
    if (input !== null && typeof input === 'object') return { overrides: sanitizeOverrides(input) };
    const read = readImport(String(input ?? ''));
    return read.error ? { error: read.error } : { overrides: read.overrides };
}
