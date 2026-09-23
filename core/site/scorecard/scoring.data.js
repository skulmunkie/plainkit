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
    ['--btn-warn-fg', '--btn-warn-bg'], ['--btn-warn-fg', '--btn-warn-hover-bg'], ['--btn-mini-fg', '--btn-mini-btn-warn-bg'], ['--btn-mini-fg', '--btn-mini-btn-warn-hover-bg'],
];

// Documented exceptions: a score that is below 100 on purpose, with the reason. Never silent; the report lists these.
export const EXCEPTIONS = [
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
    elementGzKb: { target: 2, limit: 4.5, note: 'one dist/elements/<name>.js: template, css and behaviour together; raised from 4 for pk-input\'s copyable feature (issue #209) after trimming its clear/reveal icons to glyphs closed most, not all, of the gap' },
    baseRuntimeGzKb: { target: 2, limit: 2.8, note: 'js/element.js + js/element-core.js (comments stripped); raised from 2.5 for the logging every element now does (issue #16)' },
    jsModuleGzKb: { target: 3, limit: 6 },
    baseJsGzKb: { target: 0, limit: 10, note: 'the modules a plain page imports through plainkit.js: the invokers, log, element loader, theme, colour' },
};

// Text policy, two tiers (px at the 14px root). Reading text (body, cells, labels, inputs, buttons, nav items, help) is at least
// 14px. Secondary text (META_TEXT below) is at least 12px. Anything under 12px, or reading text under 14px, is a defect.
//
// Decision (issue #141): the policy follows the elements. The elements draw their captions, chips and counts at --text-meta on purpose, and the token
// agrees with the tier: --text-meta is 0.86rem = 12.04px at the 14px root (a floor, not a target: 12px passes), and 13.02px on a phone, where it is
// larger for legibility. Nothing here lowers a limit; the 14px reading floor and the 12px secondary floor are the same numbers as before. What changed is
// which text counts as secondary: the list used to name classes of the removed class-based components, so every pk-badge, nav group heading and shell
// footer read as reading text under 14px. Each entry names the current element or part that carries secondary text, with the reason, and
// tests/text-tiers.test.mjs keeps the list honest (every named element exists and sets its own text at the meta size; every class exists).
// Nav item labels stay reading text (14px); an inline `code` is 0.92em of its context and counts as secondary (a smaller x-height is what makes code sit
// evenly in a line); a column header (th) is a caption. Mini buttons are 12px (13px on a phone) and are secondary text too.
export const META_TEXT = [
    ['pk-badge, pk-tag, pk-divider', 'chips and captions: each sets font-size to --text-meta on its host'],
    ['pk-nav-item[group]', 'a nav group heading is a caption (nav-item.css, the [group] link)'],
    ['pk-nav-item [slot="badge"]', 'the count at the end of a nav row (nav-item.css [part="badge"])'],
    ['.gx-nav-title', "the gallery's own nav group heading, the same caption as pk-nav-item[group]"],
    ['pk-app-shell [slot="footer"]', 'the shell footer strip (app-shell.css [part="footer"])'],
    ['pk-form-actions [slot="status"]', 'the status text beside the form buttons (form-actions.css .status)'],
    ['pk-pager span', 'the range note of the pager (pager.css [part="note"])'],
    ['pk-menu-item[type="header"], pk-menu-item [slot="description"], pk-menu-item [slot="suffix"]', 'menu group headings, descriptions and shortcuts (menu-item.css)'],
    ['pk-dropzone [slot="hint"]', 'the hint under the drop area (dropzone.css .hint)'],
    ['pk-field-list[dense]', 'a dense field list (field-list.css [dense])'],
    ['pk-alert[compact], pk-alert[compact] *', 'the compact alert (alert.css [compact])'],
    ['pk-button[size="mini"]', 'mini buttons (button.css [size="mini"])'],
    [':not(pre) > code', 'inline code is 0.92em of its context'],
    ['th, kbd, time', 'column headers, key caps and timestamps are captions'],
    ['.u-text-xs, .u-text-sm', 'the utilities that set the meta size'],
    ['.cv-scroll, .cv-scroll *, .cv-no, .cv-meta, .cv-meta *, .cv-notice, .csr-text, .csr-text *, .csr-no, .co-kind, .co-line', 'the code explorer: line numbers, file meta, notices and console rows (modules/code-explorer)'],
    ['.gx-icon, .gx-icon *, .gx-box *, .gx-z *', 'gallery demo swatches: an icon grid, a box-model and a z-index sample, where the text is a caption for the thing shown'],
];
export const TEXT_TIERS = {
    readingPx: 14,
    metaPx: 12,
    demoSelectors: '.gx-effect *, .gx-demo *',
    metaSelectors: META_TEXT.map(([selector]) => selector).join(', '),
};
// Phone touch targets that are exempt, each with its reason (the scorecard lists these; a target not matching one is a defect).
export const TARGET_EXCEPTIONS = [
    { selector: 'input[type="range"]', reason: 'Native slider: the browser draws its own thumb and hit area; the row it sits in is tall enough.' },
    { selector: 'input[type="file"]', reason: 'Native file picker button; its label row is the tap target.' },
    { selector: '.tag-pill-x', reason: 'Remove control inside a tag pill; the pill and the text field are the targets, and a 44px cross would double the pill height.' },
    { selector: '.cnb-folder', reason: 'A breadcrumb-style text button in a path trail, like the crumb links.' },
];
