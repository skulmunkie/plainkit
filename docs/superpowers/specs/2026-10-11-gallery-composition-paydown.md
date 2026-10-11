# Gallery composition paydown (module baseline, #682)

Status: proposal for the owner. Read-only research; no code changed. Date 2026-10-11, base `origin/integration-0.13`.

## 1. Where the debt is

`node scripts/audit-modules.mjs` reports 286 baselined findings. Three gallery files hold 113 of them (40%):

| File | Total | S3 (class / className / classList) | S7 (document., location., ...) | S5 (innerHTML) | S1 (app CSS) |
| --- | --- | --- | --- | --- | --- |
| `core/site/gallery/gallery.js` | 65 | 38 | 25 | 2 | 0 |
| `core/site/gallery/gallery-views.js` | 31 | 28 | 2 | 0 | 1 |
| `core/site/gallery/preview.js` | 17 | 4 | 12 | 1 | 0 |
| **Sum** | **113** | **70** | **39** | **3** | **1** |

(Counted by running the module ruleset over the three files with line numbers; S3 hits were then grouped by the class token on the hit line. That is exact except where two hits share a line, so family counts can be off by one.)

Two different problems are mixed in that number:

- **70 S3 + 3 S5 + 1 S1 are composition debt.** Hand-written `gx-*` / `pv-*` classes style layout the elements can already do, plus a few real gaps.
- **39 S7 are not composition.** They are `document.`/`location.`/`window.` access in the gallery's own boot and routing code. The rule text says: "Fine in a bootstrap file; inside a module this belongs behind the SDK's own APIs." Only #346 (mountApp for the Gallery) or a decision that these files are bootstrap files fixes them. Swapping classes does not (see Q1).

## 2. Family table

Elements are cited by `core/<tier>/<name>/<name>.meta.json`. Effort S/M/L = about 50 / 200 / 400+ lines. "Entries" = baseline entries held (approximate, see above).

| Class family | File | Entries | Replacement or gap | Effort | Visual risk |
| --- | --- | --- | --- | --- | --- |
| `gx-shell`, `gx-main`, `gx-body`, `gx-view`, `gx-nav`, `gx-mount`, `gx-full`, `gx-flow`, `gx-contents` (page frame: nav column, bar, scrolling body) | gallery.js (+ gallery.css, about 60 lines) | ~14 | **Existing.** `pk-app-shell` (shells/app-shell: slots nav / header / body / footer; a `data-nav-toggle` child opens the off-canvas nav, `navHidden` hides it on wide) with `pk-side-nav` (elements/side-nav: `filterable`, off-canvas at 1024px and below) in `nav`. Replaces the hand `gx-contents` button and the nav width/FOUC CSS. `gx-flow` (bare mode) is `pk-stack fill`. | L | High (the first-load no-layout-shift work of #135/#1076 lives in this CSS) |
| `gx-bar`, `gx-bar-main`, `gx-pagebar`, `gx-group`, `gx-group-label`, `gx-back`, `gx-title`, `gx-theme`, `gx-open`, `gx-inspect`, `gx-end` (the two toolbars) | gallery.js | ~14 | **Existing.** `pk-toolbar` (components/toolbar: heading + note lead, `actions` slot, wraps/stacks by container width, touch-sized) or `pk-cluster` (`nowrap`, `justify="between"`, `align="center"`) in the app-shell `header` slot; `pk-button-group mode="single"` for the viewport switch (already used); `pk-text variant="eyebrow"` for the group label; `pk-heading` for the title. Margin-auto "push right" becomes `justify="between"` or two clusters. | M | Medium (bar heights, tap targets) |
| `gx-desktop-only`, `gx-wide-only`, `gx-compact-only`, `gx-phone-only` (responsive show/hide of toolbar groups) | gallery.js + gallery.css | ~10 | **Redesign or gap G1.** No element or attribute shows/hides a child by breakpoint. Option A (no gap): drop the variants, show one `pk-dropdown` "Display" menu at every width. Option B: JS picks the markup with `core/js/breakpoints.js`. Option C: file G1 below. | S (A) / M (C) | Medium (changes what desktop users see) |
| `gx-resize`, `gx-view--inspecting` (draggable docked inspector) | gallery.js + gallery.css | ~4 | **Probably existing.** `pk-splitter` (elements/splitter: two panes, draggable separator, `min`/`max`, arrow keys, `orientation`) with the inspector as the `end` pane, or `pk-workspace` (elements/workspace: nav / main / aside panes, `asideOpen`, phone tab strip). Neither documents a collapsed (size 0) end pane or a persisted width: verify first, else gap G3. `pk-drawer docked` exists today but has no resize. | M | High (the docked-over-edge overlap logic goes away) |
| `gx-stagebox`, `gx-page-frame`, `gx-page-frame--phone`, `gx-slot` (full-page sample iframe) | gallery.js | ~3 | **Existing.** `pk-frame` (elements/frame: `src`, `preset` phone/tablet/desktop/full, `height`, `theme`, `sandbox`, `loading`). It is exactly the sample host; `gx-stagebox` becomes a `pk-stack fill`. | S | Low |
| `gx-page`, `gx-el-group` (page column, group margin) | gallery.js | 2 | **Existing.** `pk-container` (max width, centred) or `pk-stack gap`; the group `h2` becomes `pk-heading level=2`. | S | Low |
| `gx-frame`, `gx-stage` (inline example frame) | gallery-views.js, frame.js | 1 + frame.js | **Existing.** `pk-frame`. frame.js and frame-boot.js are a hand-rolled version of the same element. | S | Low |
| `gx-head` | gallery-views.js | 1 | **Existing.** `pk-page-header` (components/page-header: `heading`, `level`, `crumbs`, `variant`). The title-size override uses the `--pk-page-header-title-size` hook, but setting it from `gallery.css` is S1, so use the default size. | S | Low |
| `gx-entry` (+ `.gx-entry h4`) | gallery-views.js | 4 | **Existing.** `pk-card` already is the entry; the margin comes from a parent `pk-stack gap="md"`; the `h4` is `pk-heading level=4`. | S | Low |
| `gx-tile` | gallery-views.js | 1 | **Existing.** `pk-card href` (elements/card: "optionally one link") inside `pk-grid min=...`. | S | Low |
| `gx-find` (filter forms) | gallery-views.js | 2 | **Existing.** `pk-form` (elements/form) + `pk-cluster align="end"` + `pk-field`/`pk-input type="search"`; margin from the parent stack. | S | Low |
| `gx-pair` (desktop + phone sample side by side; first half dropped on phones) | gallery-views.js | 2 | **Existing + small JS.** `pk-grid ratio=...` (elements/grid: `columns`, `ratio`, `min`) collapses to one column on a phone by itself. Dropping the desktop half on a phone needs G1 or a breakpoint check. | M | Medium |
| `gx-samples` | gallery-views.js | 1 | **Existing.** `pk-grid min`. | S | Low |
| `gx-icons`, `gx-icon` (icon sheet) | gallery-views.js | 2 | **Existing.** `pk-grid min` of `pk-stack align="center" gap="xs"` cells holding `pk-icon size=lg` + `pk-text size=meta`. | S | Low |
| `gx-table`, `num` (API tables, card-per-row on phone) | gallery-views.js + gallery.css (25 lines) | 3 | **Existing.** `pk-table` data mode (`columns` with `align:"end"` / `type:"number"`, `rows`, `cards`, `hidePhone`) replaces the raw `<table>`, the `num` class and the phone-card CSS. Cells that carry HTML use the `cell-<rowId>-<key>` slots. | M | Medium (cell rendering, long code values) |
| `gx-swatch`, `gx-swatch-cell` (colour tokens) | gallery-views.js | 2 | **Existing.** `pk-swatch token=...` (elements/swatch: resolved value plus WCAG label). | S | Low |
| `gx-demo` (type scale row) | gallery-views.js | 1 | **Existing.** `pk-cluster` already wraps it; the class is redundant. `data-dyn="font-size:..."` stays via `dynamic.js`. | S | Low |
| `u-fs-1p1r u-m0` | gallery-views.js | 1 | **Existing.** `pk-text size=...`. | S | Low |
| `gx-space-bar`, `gx-space-row`, `gx-box`, `gx-effect`, `gx-z` (spacing, radius, shadow, layer, size specimens) | gallery-views.js + gallery.css | 6 | **Gap G2.** `pk-swatch` samples colours only. Nothing draws "a bar of N spacing", "a corner with radius R", "an elevation with shadow S" or a layer chip from a token name. | M (element) + S (swap) | Medium |
| `pv-body`, `pv-host`, `pv-device`, `pv-page` | preview.js + frame.css | 4 | **Existing.** `pk-frame preset=phone` for the device case, `pk-container` + `pk-stack` for the page case; the body flex centring is `pk-stack fill align=center` or goes away. | S | Low |
| `lay-shell*` (app-shell schematic) | frame.css, gallery-views.js | 0 now (S1 in CSS only) | **Existing.** It is a drawing of `pk-app-shell`; show the real element at reduced size in a `pk-frame`. | M | Medium |
| `<link rel=stylesheet>` inside a code-sample string | gallery-views.js | 1 (S1) | **False positive.** A literal inside a `codeBlock()` string. Move the sample text to a data file, or change the scanner (Q2). | S | None |
| `innerHTML` sinks (`out.innerHTML`, `container.innerHTML`, `page.innerHTML`) | gallery.js, preview.js | 3 (S5) | **Existing.** `js/sanitized-html.js` or `replaceChildren` with parsed template content; also lowers the `core/tools/security.allow.json` count. | S | Low |
| `document.`, `location.`, `window.`, `addEventListener`, `setTimeout` | all three | 39 (S7) | **Not composition.** About 10 disappear incidentally when the chrome is rebuilt on `pk-app-shell`/`pk-toolbar` (the `[data-set-theme]` sync loops, pagebar toggling). The rest need #346 (mountApp owns routing, title, theme) or the bootstrap decision in Q1. | L (#346) | n/a |

## 3. Totals

- **Retirable now with existing elements (S3 + S5, no new component):** about **57** entries (gallery.js 30, gallery-views.js 22, preview.js 5), plus about 10 S7 that vanish with the shell rewrite.
- **Blocked by a real gap or a design decision:** about **17** entries: G2 specimens 6; responsive show/hide 10 (only if Option C is chosen; Option A retires them with no new component); 1 false-positive S1.
- **S7, separate track (#346 / Q1):** about **29** entries after the ~10 incidental ones.

Projected baseline: 286 - 57 - 10 (S7, incidental) - 10 (Option A) - 1 = about 208, and about 202 once G2 lands. What remains in the three files is S7.

## 4. Ordered step plan

Each step is one issue, one branch, one PR of about 400 hand-written lines, leaves `main` releasable, deletes the baseline entries it retires, and (AGENTS.md, "Reviewing what it looks like") needs `ui-review` screenshots, plus a scenario for any state a still cannot show, opened and looked at before merge. Order is entries retired per unit of risk, best first.

1. **Gallery content pages onto existing layout** (gallery-views.js, gallery.css). `gx-head` to `pk-page-header`; `gx-entry`, `gx-tile`, `gx-samples`, `gx-icons`, `gx-find`, `u-*` to `pk-card`, `pk-grid`, `pk-stack`, `pk-form`, `pk-text`; `gx-swatch*` to `pk-swatch`; `gx-demo` dropped. Retires about 18, deletes about 60 lines of CSS. Effort M, risk low.
2. **Preview host and sample frames on `pk-frame` / `pk-container`** (preview.js, frame.css, frame.js, frame-boot.js, gallery-views.js `gx-frame`, gallery.js `gx-stagebox`/`gx-page-frame`/`gx-slot`/`gx-page`/`gx-el-group`). Retires about 15 including frame.js entries outside the three files. Effort M, risk low (the element is purpose-built for this).
3. **`innerHTML` sinks to DOM/sanitized APIs** (gallery.js, preview.js). Retires 3. Effort S, risk low. Fold into step 2 if it fits in 400 lines.
4. **`pk-table` for the API tables** (gallery-views.js, gallery.css). `gx-table`/`num` and the phone-card CSS go. Retires about 3, deletes about 25 lines of CSS. Effort M, risk medium; its own step so a regression is easy to revert.
5. **Toolbars on `pk-toolbar` / `pk-cluster`** (gallery.js bars, gallery.css). Decide Q3 first. Retires about 14 (about 24 with Option A, because the `*-only` classes go). Effort L, risk medium. Scenarios for the phone bar, a menu open and right-to-left.
6. **App frame on `pk-app-shell` + `pk-side-nav`** (gallery.js, gallery.css). Retires about 14 S3 and about 10 S7. Effort L, risk high: the #135/#1076 no-layout-shift guards must be re-proved with the browser cases; compare first-load screenshots with the current ones. Best done together with #346 (Q5).
7. **Inspector on `pk-splitter` (or `pk-workspace`)** (gallery.js, gallery.css). Retires about 4. Effort M, risk high. First a short spike to verify a collapsible end pane; file G3 only if it fails.
8. **New element G2 (token specimen)** per its issue, then swap the 6 `gx-space-*`/`gx-box`/`gx-effect`/`gx-z` uses. Effort M + S, risk medium.
9. **`lay-shell` schematic replaced by a real `pk-app-shell` in a `pk-frame`** (frame.css, gallery-views.js). Removes the last `frame.css` rules. Effort M, risk medium.
10. **S7 (about 29)**: not a composition step; owned by #346 or by Q1.

Steps 1-4 retire about 39 entries for low-to-medium risk and no new component; steps 5-7 retire about 30 more with real layout risk.

## 5. Proposed new component issues (real gaps)

### G2: token specimen element (the one confirmed gap)

Title: `Element: pk-specimen, draw a design token as a sample (spacing, radius, shadow, layer, size)`

Body:

> **Why.** `pk-swatch` samples a colour token. The Gallery's foundations pages also need to show spacing, radius, shadow, z-index and touch-size tokens, and today do it with hand-written `gx-space-bar`, `gx-box`, `gx-effect`, `gx-z` classes (6 entries in the module baseline, #682). AGENTS.md says to file the gap here instead of keeping a local stand-in. A style-guide page, the theme editor and any consumer's own design documentation need the same thing.
>
> **What.** A `tier: element` that takes `token` (for example `--space-4`, `--radius-md`, `--shadow-2`, `--z-sticky`) and `kind` (`space | radius | shadow | size | layer`, inferred from the token prefix when omitted) and renders: a bar of the resolved length (space, size), a corner sample (radius), an elevated tile (shadow), a labelled chip (layer); plus the token name and resolved value as text, as `pk-swatch` does. Optional slot for a label override.
>
> **Out of scope.** Colours (`pk-swatch`); type samples (`pk-text` with a token size already works).
>
> **Done when.** Element, meta.json, docs and a gallery sample; Blazor mapping; `kind` inferred for the five prefixes; legible in light and dark; a browser case measuring that the space bar's rendered length equals the resolved token; changelog fragment. Unblocks the Gallery foundations pages (`Refs #682`).

### G1: responsive show/hide of toolbar actions (only if the owner picks Option C in Q3)

Title: `pk-toolbar: move low-priority actions into a menu below a container width`

Body:

> **Why.** The Gallery's two toolbars show different controls on phone, medium and wide (`gx-desktop-only`, `gx-wide-only`, `gx-compact-only`, `gx-phone-only`: about 10 baseline entries, #682). No element shows or hides a child by width. `pk-toolbar` wraps and stacks but cannot move actions into a menu.
>
> **What.** An `overflow` mode on `pk-toolbar` that moves actions marked `priority="low"` into a `pk-dropdown` below a container width. Prefer this to a generic show-from/hide-from attribute: it is the pattern users expect and keeps the DOM single.
>
> **Done when.** Container-query based (not viewport), tab and screen-reader order unchanged, browser cases measuring the switch, Blazor mapping, docs, changelog fragment. Unblocks Gallery steps 5 and 6.

### G3: collapsible, resizable end pane (only if the step 7 spike fails)

Title: `pk-splitter / pk-workspace: collapsible end pane with persisted size`

Body:

> **Why.** The Gallery's docked inspector (Details) opens over the right edge, resizes by dragging and closes to nothing (`gx-resize`, `gx-view--inspecting`: about 4 baseline entries, #682). `pk-splitter` resizes two always-visible panes; `pk-workspace`'s `asideOpen` toggles an aside but does not resize it; `pk-drawer docked` does neither. A short spike with `pk-splitter` comes first; file this only if the spike shows a gap.
>
> **What.** `collapsed` on the end pane (size 0, separator hidden, `aria-expanded` on the opener) and `persist="<key>"` for the size.
>
> **Done when.** Browser case for drag, arrow keys and collapse; docs; Blazor mapping; changelog fragment.

## 6. Open questions for the owner

1. **Are `gallery.js` / `preview.js` bootstrap files?** The S7 text says platform access is "fine in a bootstrap file". 39 of the 113 entries are S7 and no composition work retires them. Recommendation: do not allow-list or relabel; split the genuinely bootstrap parts (`preview.js`, `frame-boot.js`, the `document.documentElement` theme/width set-up) into boot files like those in `gallery/boots/`, and let #346 take routing, title and events.
2. **Scanner false positives in string literals** (the `<link rel="stylesheet">` in a `codeBlock()` sample, S1). Recommendation: move code samples to data files; do not change the scanner.
3. **The `*-only` toolbar variants: redesign (A), breakpoint-driven JS (B) or a new component (C)?** Recommendation: A for now (one Display menu at every width). It is the only option with no new code, and a demo site's toolbar is better with fewer moving parts. Revisit with C if the wide toolbar feels poorer in review.
4. **Is a visual change acceptable where the swap is not pixel-identical** (bar heights from `pk-toolbar`, table cards, page-header size)? Recommendation: yes for steps 1-5 with screenshots attached and the no-layout-shift guards green; no for step 6, where first-load behaviour must match today's screenshots.
5. **Shell (step 6) before or with #346?** Recommendation: do steps 1-4 now, and do the shell as part of #346 rather than twice, because mountApp will own the same chrome and the S7 hits sit on the same lines.
6. **Apply the same playbook to the other 173 entries** (`scorecard`, `guides`, `theme`, `layout-builder`, `files`)? Recommendation: finish steps 1-4 here, measure entries retired per PR, then fold the sibling pages into #682 as follow-up steps instead of planning them now.

## 7. Verification notes

- Counts: `node scripts/audit-modules.mjs` after `node scripts/bootstrap.mjs` (198 files scanned, 286 total, 286 baselined, 0 new). Per-file totals are from the baseline file; per-rule and per-family counts come from running the module ruleset over the three files with line numbers.
- The baseline only shrinks: each step removes the entries it retires; `--update-baseline` only after fixing, never to hide a finding.
