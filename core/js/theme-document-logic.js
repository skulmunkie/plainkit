// The one theme document: { version, shared, dark, light, breakpoints? }. No DOM: values in, values out.
//
//   writeDocument(overrides, { breakpoints })   the document object (only sections that hold something are required by readers; all three are written)
//   writeDocumentText(overrides, options)       the same as JSON text (the editor's JSON box, the share link payload)
//   readDocument(input)                         { doc: { version, overrides, breakpoints } } | { error }
//
// One reader for every entry point: pasted JSON, an override CSS block, a share link payload, a saved theme ({ name, overrides }), a preset's theme and
// a plainkit.custom.json settings file (its "theme" and "breakpoints"). Older formats are read for good: no "version" means 1, the plain
// { shared, dark, light } of before, an override CSS block and the settings file all still import. A newer version than this reader knows is refused,
// not guessed at. Every name and value passes the SDK's rules (js/theme.js): the input is data, never trusted, and a refusal changes nothing.

import { sanitizeOverrides } from './theme.js';
import { readImport } from './theme-editor-logic.js';

export const DOC_VERSION = 1;
export const SETTINGS_FORMAT = 'plainkit-custom-sdk';
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Breakpoints are carried as a plain { name: pixel width } map; anything else in it is dropped, so the reader never passes a hostile shape on.
function cleanBreakpoints(raw) {
    if (!isObject(raw)) return undefined;
    const out = {};
    for (const [k, v] of Object.entries(raw)) if (/^[a-z][a-z0-9-]{0,23}$/.test(k) && Number.isInteger(v) && v > 0 && v <= 10000) out[k] = v;
    return Object.keys(out).length ? out : undefined;
}

export function writeDocument(overrides, { breakpoints } = {}) {
    const o = sanitizeOverrides(overrides);
    const bp = cleanBreakpoints(breakpoints);
    return { version: DOC_VERSION, shared: o.shared, dark: o.dark, light: o.light, ...(bp ? { breakpoints: bp } : {}) };
}

export const writeDocumentText = (overrides, options = {}) => JSON.stringify(writeDocument(overrides, options));

const versionProblem = v => (v === undefined || (Number.isInteger(v) && v >= 1 && v <= DOC_VERSION) ? null
    : Number.isInteger(v) && v > DOC_VERSION ? `This theme was made by a newer Plainkit (document version ${v}; this one reads up to ${DOC_VERSION}).`
        : 'The theme document has an invalid "version".');

// The object form: the document itself, a settings file, a saved theme { name, overrides } or a bare { shared, dark, light }.
function fromObject(raw) {
    const body = raw.format === SETTINGS_FORMAT ? { ...raw.theme, breakpoints: raw.breakpoints, version: undefined }
        : !('shared' in raw || 'dark' in raw || 'light' in raw) && isObject(raw.overrides) ? raw.overrides : raw;
    const problem = versionProblem(body.version);
    if (problem) return { error: problem };
    return { doc: { version: body.version ?? 1, overrides: sanitizeOverrides(body), breakpoints: cleanBreakpoints(body.breakpoints) } };
}

export function readDocument(input) {
    if (isObject(input)) return fromObject(input);
    const text = String(input ?? '');
    const isJson = text.trim().startsWith('{') && !text.includes('[data-theme') && !text.includes(':root');
    let raw = null;
    if (isJson) { try { raw = JSON.parse(text); } catch { return { error: 'Not JSON and not an override CSS block.' }; } }   // the text is the user's: say what is wrong with it, nothing to log
    if (isObject(raw) && raw.format === SETTINGS_FORMAT) return fromObject(raw);
    const read = readImport(text);
    if (read.error) return { error: read.error };
    const problem = isObject(raw) ? versionProblem(raw.version) : null;
    if (problem) return { error: problem };
    return { doc: { version: raw?.version ?? 1, overrides: read.overrides, breakpoints: isObject(raw) ? cleanBreakpoints(raw.breakpoints) : undefined } };
}
