// Hint tables for the D-family "what to use instead" messages (design section 3.1).
//
// PLACEHOLDER DATA: A-3 (docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md, section 3.1) replaces
// every table below with data generated at build time from `core/elements/*/*.meta.json` (`replaces`, `aliases`)
// and `core/dist/elements/api.json`. Until then these are small hand-written tables covering a handful of
// obvious cases, only so the D-family rule logic and its tests are not blocked on that generator existing.
// Do not grow these by hand beyond what a rule's tests need - a bigger hand-written table is exactly the drift
// risk A-3 exists to remove.

// Raw standard tag -> the pk-* element that replaces it (D1, and the generic S4 tag list).
export const TAG_HINTS = {
    button: 'pk-button',
    input: 'pk-input',
    select: 'pk-select',
    textarea: 'pk-textarea',
    table: 'pk-table',
    dialog: 'pk-dialog',
    details: 'pk-details',
    progress: 'pk-progress',
    hr: 'pk-divider',
};

// Class name (bare, no leading dot) -> the pk-* element it hand-rolls (D2).
export const CLASS_HINTS = {
    modal: 'pk-dialog',
    dialog: 'pk-dialog',
    tabs: 'pk-tabs',
    'tab-panel': 'pk-tabs',
    dropdown: 'pk-dropdown',
    tooltip: 'pk-tooltip',
    toast: 'pk-toast-stack',
    accordion: 'pk-accordion',
    breadcrumb: 'pk-breadcrumb',
    card: 'pk-card',
    badge: 'pk-badge',
    spinner: 'pk-spinner',
    avatar: 'pk-avatar',
    stepper: 'pk-stepper',
    pagination: 'pk-pagination',
};

// role="..." value -> the pk-* element that already owns that role (D2).
export const ROLE_HINTS = {
    tablist: 'pk-tabs',
    dialog: 'pk-dialog',
    menu: 'pk-menu',
    listbox: 'pk-list-box',
    tooltip: 'pk-tooltip',
};

// Platform API -> the pk-* element/API that already wraps it (D7). A hint rule only (design section 2.1: "never
// an error, because the API has other legitimate uses").
export const API_HINTS = [
    { re: /\bshowModal\s*\(/, element: 'pk-dialog', api: 'showModal()' },
    { re: /\bclipboard\.writeText\s*\(/, element: 'pk-copy-button', api: 'clipboard.writeText' },
    { re: /\bIntersectionObserver\b/, element: 'pk-back-to-top', api: 'IntersectionObserver' },
    { re: /matchMedia\(\s*['"]\(prefers-color-scheme/, element: 'the theme API', api: "matchMedia('(prefers-color-scheme...')" },
    { re: /\bResizeObserver\b/, element: 'pk-splitter', api: 'ResizeObserver' },
];

// Utility-class layout token -> the pk-* layout element that replaces it (D9).
export const UTILITY_LAYOUT_CLASSES = new Set(['d-flex', 'flex-row', 'flex-column', 'row', 'col', 'u-flex', 'u-grid']);
export const UTILITY_LAYOUT_PREFIXES = ['col-'];
