// Hint tables for the D-family "what to use instead" messages (design section 3.1).
//
// A-3 (docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md, section 3.1) replaces the hand-written placeholder
// tables this file used to carry with data generated at build time from core/elements/*/*.meta.json (`replaces`, `aliases`) by
// core/tools/audit/data.mjs; regenerate with `node core/tools/audit/data.mjs` (part of `node scripts/bootstrap.mjs`).
// This file itself stays free of repository paths - it only re-exports the generated module's tables, so the rule families keep
// importing from here unchanged.
export { TAG_HINTS, CLASS_HINTS, ROLE_HINTS, ELEMENT_TAGS, ELEMENT_ATTRS, A11Y_REQUIRES, DEPRECATED_ELEMENTS, DEPRECATED_ATTRS, TOKENS, PAGE_TYPES } from './generated.data.mjs';
import { API_HINTS as GENERATED_API_HINTS } from './generated.data.mjs';

// D7 rules match a hint by regexing the source for the API's call/reference shape; the generated table only carries the API
// name and the element, so the small set of match patterns (one per API, not per element) stays hand-written here.
const API_PATTERNS = {
    showModal: { re: /\bshowModal\s*\(/, label: 'showModal()' },
    'clipboard.writeText': { re: /\bclipboard\.writeText\s*\(/, label: 'clipboard.writeText' },
    IntersectionObserver: { re: /\bIntersectionObserver\b/, label: 'IntersectionObserver' },
    ResizeObserver: { re: /\bResizeObserver\b/, label: 'ResizeObserver' },
};

export const API_HINTS = GENERATED_API_HINTS
    .filter(({ api }) => API_PATTERNS[api])
    .map(({ api, element }) => ({ re: API_PATTERNS[api].re, element, api: API_PATTERNS[api].label }));

// The theme API has no element counterpart in the catalogue (it is the runtime theme API, not a pk-* element), so it stays a
// hand-written hint here rather than a `replaces` entry on any element.
API_HINTS.push({ re: /matchMedia\(\s*['"]\(prefers-color-scheme/, element: 'the theme API', api: "matchMedia('(prefers-color-scheme...')" });

// Utility-class layout token -> the pk-* layout element that replaces it (D9). Not a per-element catalogue lookup (design
// section 2.1: these are generic utility-CSS conventions, not one element's name or alias), so it stays hand-written.
export const UTILITY_LAYOUT_CLASSES = new Set(['d-flex', 'flex-row', 'flex-column', 'row', 'col', 'u-flex', 'u-grid']);
export const UTILITY_LAYOUT_PREFIXES = ['col-'];
