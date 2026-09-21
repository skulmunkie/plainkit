// Scoring definitions for the SDK scorecard: every threshold is a setting here, none is buried in code.
// A metric scores 100 at or better than `good`, 0 at or worse than `poor`, and linearly between. `lowerIsBetter` says which way
// is better. A category is the weighted mean of its metrics; the overall score is the weighted mean of the categories.
// Change a number, reload the scorecard page, and every score and ranking follows.

export const SCORING = {
    version: 1,
    widths: [320, 375, 640, 1024, 1280],       // viewport widths the responsive check renders every sample at
    themes: ['dark', 'light'],
    scaleRows: [100, 1000, 5000],               // rows rendered in the scale test
    historyKey: 'pk-scorecard-history',
    historyMax: 40,
    findingPenalty: { error: 25, warn: 8 },     // points a finding costs one control (floor 0)
    categories: {
        performance: {
            label: 'Performance',
            weight: 25,
            metrics: {
                cssKb:          { label: 'Stylesheet size (KB, page-level layer; elements load on demand)', good: 90, poor: 300, lowerIsBetter: true, weight: 2 },
                jsKb:           { label: 'Script size (KB, base runtime loaded on every page)', good: 40, poor: 150, lowerIsBetter: true, weight: 1 },
                unusedRatio:    { label: 'Selectors unused by the gallery (0-1)', good: 0.25, poor: 0.7, lowerIsBetter: true, weight: 1 },
                lcpMs:          { label: 'Largest contentful paint (ms)', good: 1200, poor: 4000, lowerIsBetter: true, weight: 2 },
                cls:            { label: 'Cumulative layout shift', good: 0.02, poor: 0.25, lowerIsBetter: true, weight: 2 },
                longTasks:      { label: 'Long tasks (>50 ms)', good: 0, poor: 6, lowerIsBetter: true, weight: 1 },
                inpMs:          { label: 'Slowest interaction proxy (ms)', good: 100, poor: 500, lowerIsBetter: true, weight: 1 },
                domNodes:       { label: 'DOM nodes on the page', good: 1500, poor: 8000, lowerIsBetter: true, weight: 1 },
                recalcMs:       { label: 'Style recalculation after a theme switch (ms)', good: 20, poor: 200, lowerIsBetter: true, weight: 1 },
            },
        },
        scale: {
            label: 'Scale',
            weight: 20,
            metrics: {
                rows100Ms:      { label: 'Render + layout 100 rows (ms)', good: 15, poor: 120, lowerIsBetter: true, weight: 1 },
                rows1000Ms:     { label: 'Render + layout 1,000 rows (ms)', good: 80, poor: 600, lowerIsBetter: true, weight: 2 },
                rows5000Ms:     { label: 'Render + layout 5,000 rows (ms)', good: 400, poor: 3000, lowerIsBetter: true, weight: 2 },
            },
        },
        look: {
            label: 'Look',
            weight: 35,
            metrics: {
                contrastFail:   { label: 'Text pairs below WCAG AA (count)', good: 0, poor: 6, lowerIsBetter: true, weight: 3 },
                literalColours: { label: 'Literal colours outside tokens.css', good: 0, poor: 25, lowerIsBetter: true, weight: 2 },
                literalSizes:   { label: 'Literal sizes not on a token (share of size declarations)', good: 0.3, poor: 0.9, lowerIsBetter: true, weight: 1 },
                spacingFindings: { label: 'Spacing findings: zero gaps, tight controls, text at a box edge, uneven stacks', good: 0, poor: 15, lowerIsBetter: true, weight: 3 },
                controlScore:   { label: 'Mean control score across widths and themes', good: 95, poor: 60, lowerIsBetter: false, weight: 4 },
            },
        },
        accessibility: {
            label: 'Accessibility',
            weight: 20,
            metrics: {
                a11yErrors:     { label: 'Unnamed controls, missing alt, no focus ring (count)', good: 0, poor: 10, lowerIsBetter: true, weight: 3 },
                a11yWarnings:   { label: 'Positive tabindex and other order warnings (count)', good: 0, poor: 8, lowerIsBetter: true, weight: 1 },
            },
        },
    },
};

export const TEXT_PAIRS = [
    ['--color-text', '--color-bg'], ['--color-text', '--color-panel'], ['--color-muted', '--color-bg'],
    ['--color-muted', '--color-panel'], ['--color-link', '--color-panel'], ['--color-accent', '--color-panel'],
    ['--btn-primary-fg', '--color-accent-fill'], ['--btn-primary-fg', '--color-accent-fill-hover'],
];

// Documented exceptions: a score that is below 100 on purpose, with the reason. Never silent; the report lists these.
export const EXCEPTIONS = [
    { metric: 'literalSizes', reason: 'Component CSS still carries many literal rem and px sizes that predate the spacing scale; they are being moved onto tokens as each file is touched. The share only goes down.' },
    { metric: 'contrastFail', reason: 'Text pairs measured against the panel: the muted and accent text on the light theme sit just under 4.5:1. Changing them restyles the whole app, so it needs an owner colour decision.' },
    { metric: 'touch-target', reason: 'Dense controls (mini buttons, tree rows, tab close, crumbs) are below 44px on a phone by design; the a11y layer raises the common ones. Reported per control by the scorecard run.' },
];

// Weight budgets, enforced by tests/budgets.test.mjs. target is the aim; limit is what the test allows today and only ever comes down.
// Reference: Bootstrap 5 ships about 25 KB gzip CSS and 16 KB gzip JS. The SDK's CSS covers the whole app (data grid, code explorer,
// workspace, shell) and is not yet at target; every module is loaded only where used, and first paint needs no JS at all.
// What the static score measures: the new API only. The page-level sheets, every element's css, and the scripts (shared modules and element behaviours).
export const PRIMARY_CSS = ['tokens/tokens.css', 'base/base.css', 'base/utilities.css', 'base/spacing.css', 'base/a11y.css'];

export const BUDGETS = {
    // The page layer, each element and the scripts are budgeted separately. Limits only ever come down.
    pageCssGzKb: { target: 8, limit: 10, reference: 25, note: 'dist/plainkit.css: tokens, base, utilities, spacing and a11y for the light DOM (Bootstrap 5 CSS is about 25 KB gzip)' },
    elementGzKb: { target: 2, limit: 4, note: 'one dist/elements/<name>.js: template, css and behaviour together' },
    baseRuntimeGzKb: { target: 2, limit: 2.8, note: 'js/element.js + js/element-core.js (comments stripped); raised from 2.5 for the logging every element now does (issue #16)' },
    jsModuleGzKb: { target: 3, limit: 6 },
    baseJsGzKb: { target: 0, limit: 10, note: 'the modules a plain page imports through plainkit.js: the invokers, log, element loader, theme, colour' },
};

// Text policy, two tiers (px at the 14px root). Reading text (body, cells, labels, inputs, buttons, nav items, help) is at least
// 14px. Secondary text (the selectors below) is at least 12px. Anything under 12px, or reading text under 14px, is a defect.
// Mini buttons are 12px and stay a desktop-density control: above 640px only.
export const TEXT_TIERS = {
    readingPx: 14,
    metaPx: 12,
    demoSelectors: '.gx-effect *, .gx-demo *',
    metaSelectors: '.infotip__icon, .gal-add-hint, .gx-code, .gx-code *, .tab-close, .csr-text, .csr-text *, .gx-effect *, .gx-demo *, .shell-footer, .shell-footer *, .gx-icon, .gx-icon *, .gx-box *, .gx-z *, .cv-scroll, .cv-scroll *, .chip, .badge, .snav-badge, .snav-group-title, .cv-no, .csr-no, .co-kind, .co-line, .ft-lines, .ft-count, .u-text-xs, .u-text-sm, .field-help, .field-error, .ff-hint, .page-crumbs, .page-crumbs *, .toolbar-note, .stat-card-label, .stat-card-subtext, .infotip__panel, .infotip__panel *, th, .gx-group-label, .gx-param-type, .section-header-note, .cv-meta, .cv-meta *, .cv-notice, .gal-badge, .combo-empty, .pd-reset, .btn-mini, kbd, time, .tag-pill, .tag-pill *, .stepper li::before',
};
// Phone touch targets that are exempt, each with its reason (the scorecard lists these; a target not matching one is a defect).
export const TARGET_EXCEPTIONS = [
    { selector: 'input[type="range"]', reason: 'Native slider: the browser draws its own thumb and hit area; the row it sits in is tall enough.' },
    { selector: 'input[type="file"]', reason: 'Native file picker button; its label row is the tap target.' },
    { selector: '.tag-pill-x', reason: 'Remove control inside a tag pill; the pill and the text field are the targets, and a 44px cross would double the pill height.' },
    { selector: '.cnb-folder', reason: 'A breadcrumb-style text button in a path trail, like the crumb links.' },
];
