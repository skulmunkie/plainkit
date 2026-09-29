# Audit: hand-rolled UI that duplicates existing elements, page types or helpers (#390)

Date: 2026-09-28. Base: `main` at 004ee7a. Scope: `core/site/**`, `core/modules/**`, `core/js/**` outside elements, and the newest code (page-type chunks, kanban, property grid, table-edit, wizard/record pages). Earlier passes on #390 already covered the site pages and modules by reading; this pass searched for repeated *shapes* (same helper pasted, same behaviour re-wired) with targeted greps, then read each hit.

Rule applied to every candidate (the owner's net-reduction test, as declined on #391 and #401): do it only if the replacement leaves fewer hand-written bytes and lines with the same behaviour, and nothing blocks it. Byte figures marked "measured" were counted on the current files; "estimate" figures are derived from those counts.

## Do it (issues filed)

| # | Finding | Evidence | Duplicates | Saving | Risk |
| --- | --- | --- | --- | --- | --- |
| [#497](https://github.com/skulmunkie/plainkit/issues/497) | One 6-line `h(doc, tag, props, ...children)` DOM helper is pasted into 12 modules | `core/modules/console/console.js:32`, `devtools/devtools.js:46`, `devtools/panels.js:13`, `field-group/field-group.js:42`, `layout-builder/layout-builder.js:64`, `log-settings/log-settings.js:25`, `logs/logs.js:29`, `performance/performance.js:27`, `quality/quality.js:26`, `scorecard/sections.js:8`, `theme-editor/sdk-tab.js:19`, `theme-editor/theme-editor.js:64` | itself (no shared version exists); home would be `core/js/mount-support.js`, which these modules already import | measured: copies total 3,862 chars / 72 lines; estimate: about -3.3 KB and -60 lines after one shared copy | Low: 11 copies byte-identical, one adds a `false` child filter |
| [#498](https://github.com/skulmunkie/plainkit/issues/498) | Gallery Back / Open links are hand-styled ghost buttons; the comment claiming `pk-button` has no href form is stale | `core/site/gallery/gallery.css:106-109`, `:138`; `core/site/gallery/gallery.js:531`, `:538`; the link form is in `core/elements/button/button.js:1-27` and the `href` prop of `button.meta.json` | `pk-button href` | estimate: about -0.7 KB CSS, -5 lines | Low, visual: needs `ui-review` |

## Don't (no net reduction, blocked, or intentional): do not re-investigate

| Finding | Evidence | Would duplicate | Verdict and reason |
| --- | --- | --- | --- |
| Gallery API tables restyle themselves into stacked cards | `core/site/gallery/gallery.css:158-163` (about 0.9 KB), `gallery.js:268` `dataTable()` | `pk-table[cards]` (`elements/table/table.css:46-54`) | Blocked. `cards` styles the element's own shadow `<table>` (the `columns`/`rows` mode). The gallery uses the raw slotted-table mode with HTML in cells (`<code>`, swatches), which those selectors cannot reach; converting means per-cell slots for every table and grows the code. |
| Hash routing in gallery and guides | `core/site/gallery/gallery.js` `route()`, `core/site/guides/page.js` | `core/js/router.js` | Already spiked and declined on #401 (no net reduction). |
| Details-drawer resize handle | `core/site/gallery/gallery.js:542` | `pk-splitter` | Already declined on #391. |
| Layout-builder arrow/Home/End move | `core/modules/layout-builder/layout-builder.js:62`, `:558` | a shared tree-reorder | Tracked as #395 and on `composition.allow.json`; not new. |
| Escape helper `esc` copied three times | `core/site/gallery/gallery.js:29`, `core/modules/scorecard/scorecard.js:48`, `core/modules/code-explorer/element.js:27` | itself | Measured about 150 chars each; a shared export plus three imports is roughly break-even, so no net reduction. Fold into #497 only if that PR wants it. |
| Blob-download snippet (4 places) | `core/modules/theme-editor/sdk-tab.js:97-103`, `logs/logs.js:148-153`, `scorecard/scorecard.js:209`, `theme-editor/theme-editor.js:555-561` | a shared `downloadBlob` | Estimate about -0.5 KB and -12 lines, but the four differ (body-append, timed revoke, name source); marginal, same class as #391/#401. Optional add-on to #497, not its own issue. |
| Off-screen iframe creation (three places) | `core/js/measure.js:42`, `core/modules/scorecard/scorecard.js:100`, `core/site/scorecard/sweep.js:145` | one helper | Different positions, sizes, srcdoc vs src, load handling; #394 already promoted the measurement harness. No net reduction. |
| `pool()` concurrency helper twice | `core/modules/scorecard/scorecard.js` `pool`, `core/site/scorecard/sweep.js:150` | itself | 4 lines each; sharing costs an import and a home. |
| Debounce timers | `core/site/gallery/gallery.js:616`, `core/elements/table/table.js:40` | shared debounce | Two callers, different bodies (one focuses the input afterwards); elements are bundled separately. Not worth a helper. |
| Literal `font-size: 16px` for phone inputs (about 14 places) | `core/elements/input/input.css:39`, `select.css:15`, `textarea.css:17`, `tag-input.css:15`, `table-filters.css:21`, `js/table-edit.js:8`, others | a token | A token reference is longer than the literal, so no byte saving; the value is a deliberate iOS no-zoom floor. No literal colours or off-token sizes turned up in `site/` or `modules/` CSS. |
| Per-page loading/empty/error handling | `core/js/page-states.js` is used by every page type (`card`, `dashboard-page`, `doc-page`, `list-page`, `master-detail-page`, `not-found-page`, `record-page`, `states-page`, `tool-page`, `wizard-page`) | n/a | Clean: no page type hand-rolls its own state markup. Module-level empty states use `pk-empty-state` directly. |
| Hand-built buttons, dialogs, menus, tabs in site/modules | greps for `createElement('button'|'dialog')`, `<dialog`, `role=` | pk-* elements | None found. Tables are all `pk-table` (native `<table>` only as its slotted content). Roving tabindex/arrow keys outside elements exist only in the two allow-listed layout-builder/gallery spots, plus `core/js/table-edit.js` (grid cell navigation for `pk-table`'s editing mode, part of the element by design). |
| `h`/`el` variants with other signatures | `core/js/app/nav.js:18`, `shell.js:13`, `boundary.js:27`, `page-states.js:14`, `core/js/element-inspector.js:29`, `core/site/gallery/elements-view.js:9`, `gallery.js:107`, `guides/page.js:16`, `core/site/shell.js:23` | the shared helper of #497 | Different signatures (document-bound, text argument, `class` special-case, flat kids); converting does not clearly net down. Revisit after #497 lands. |

## Not in scope of the net-reduction test (noted only)

- `core/modules/console/console.js:162` swallows a clipboard rejection with `.catch(() => { /* ... */ })` and a comment; `AGENTS.md` says no `.catch(() => {})` (the SDK logger should record it). `core/tests/no-silent-catch.test.mjs` may allow the commented form. Not filed: it is a correctness/policy nit, not a hand-rolled-UI finding.

## Method and limits

Searches: duplicated function names and bodies (`h`, `esc`, `pool`, `sleep`, `debounce`), `createElement` of buttons/tables/dialogs, arrow-key/tabindex handling, `URL.createObjectURL` and clipboard use, literal colours and pixel sizes in CSS, stale claims in comments about missing element features. The kanban, property-grid and page-type elements were checked for duplicated helpers and states handling; no findings beyond the above. This is a shape search, not a proof that nothing else exists.
