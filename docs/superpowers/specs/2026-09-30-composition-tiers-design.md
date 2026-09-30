# Composition tiers: element, component, page, module (design)

Status: proposal, for owner decision. Design only: no code, no folder moves, no audit rules land with this document.
Issue: #736. Related: #699 (samples blur), #390 and #392 (composition audit and gate), the conformance audit design
(`2026-09-28-conformance-audit-cli-design.md`) and the strict-modules design (`2026-09-28-site-v2-strict-modules-design.md`).

Verified against current `main`, not the issue text: `core/elements/` holds **120** elements (the issue says 121), each with a
`<name>.meta.json` carrying `group`, and 13 module folders live in `core/modules/`. The local branch `agent/392-composition-gate` has no commits of
its own; #392 is closed and its gate is already on `main` (`core/tests/composition-audit.test.mjs`, `core/tools/composition.allow.json`). This spec
builds on that gate rather than overlapping it.

## 1. Definitions and rules

The tier of a thing is decided by **how it is built**, not by how big or how visible it is. One test: *does its own source write raw HTML tags to
draw itself, or does it arrange other `pk-*` things?*

| Tier | Is | Allowed to write | Must not |
| --- | --- | --- | --- |
| **element** | A leaf of the system: owns its shadow tree, its ARIA and its behaviour. A `pk-*` custom element that is not mostly other `pk-*` elements. | Raw HTML tags in its own template and shadow DOM (`h1`-`h6`, `div`, `span`, `button`, `input`, `dialog`, `table`, `svg`...). | Import another tier above it. |
| **component** | A composite of elements for one UI job (a search field, a date-range picker, a nav bar). Still a `pk-*` custom element with an API. | `pk-*` elements, `<slot>`, text. Layout via `pk-stack`, `pk-cluster`, `pk-grid`, `pk-container`. | Semantic or content raw tags (see "raw tag" below). Classes and `style` for looks (S1, S3). |
| **page** | A page type: a whole screen shape (list, record, settings, dashboard, wizard) assembled mostly from components. Element form (`pk-list-page`) and app framework form (`core/js/app/pages/list.js`) are one tier, one name. | Components and elements, page-level slots. | Raw tags; drawing its own controls. |
| **module** | A behaviour bundle mounted into a page or the dock (`core/modules/*`, app framework `defineModule`): expose functionality for a purpose, built from components. Not necessarily a custom element. | Components, elements, page types, framework services. | Raw tags, classes, styles, raw interaction plumbing (existing strict-module rules S1-S12 and the #392 gate). |

Dependency direction is one way: module -> page -> component -> element. An element never names a component, page or module tag. Enforced by
scanning each tier's sources for `pk-*` names of a higher tier (a cheap check, section 4).

### What "raw HTML tag" means

A raw HTML tag is any tag in an element's template, shadow DOM, or generated markup that is **not** a `pk-*` custom element, `<slot>`, `<template>`
or plain text. "Generated" includes `document.createElement('div')`, `innerHTML`/template strings and `.html` files, because the audit already
reads all of them as markup (`scanHtml`, `scriptSafeText` in `core/tools/audit`).

Allowed in a **component**, page or module, with a reason:

1. `<slot>` and `<template>` (they are the composition mechanism, not content).
2. `svg` only for a drawing no `pk-icon` covers: default forbidden, baselined if found (icons are `pk-icon`).
3. Custom `pk-*` elements of the same or a lower tier only.
4. A temporary, baselined structural `div`/`span` in a component shadow tree while a layout element is missing; each has a `composition.allow.json`-style
   entry naming the gap issue (#336). Recommended to start, removed per entry; see open question 2.

Forbidden in a component with no exception, because a `pk-*` equivalent exists (this is D1's `TAG_HINTS` table): `button`, `input`, `select`,
`textarea`, `table`, `dialog`, `a`, `h1`-`h6`, `p`, `ul`/`ol`/`li`, `label`, `nav`, `img`, `progress`. `header`/`footer`/`section`/`nav` landmarks are
the one judgment area (a component that needs a landmark usually means the landmark belongs in an element such as `pk-app-shell` or `pk-page-header`).

An **element** may use any raw tag; it should still use a lower `pk-*` element when one exists (a `pk-select` that re-draws `button` is fine; a
`pk-date-range-picker` that draws `input` is not).

## 2. Classification of all 120 current elements

Rules of thumb applied: (a) family parents that own interaction (tabs' keyboard, tree roving focus, sortable drag) are elements; (b) a thing that
owns its ARIA pattern on raw tags is an element however complex (`combobox`); (c) "Page types" group in `.meta.json` maps to pages; (d) a thing whose
source mostly writes `pk-*` but currently also writes raw `button`/`input` is a **component with baselined debt**, not an element: the tier states
the intent, the audit tracks the debt. Counts: 83 elements, 25 components, 12 pages, 0 modules in `core/elements/` (modules already have their own
folder and ruleset; see section 3).

**Pages (12):** dashboard-page, doc-page, list-page, master-detail-page, not-found-page, note-page, record-page, settings-page, states-page,
tool-page, wizard-page, workspace-page.

**Components (25):** badge-popover\*, app-bar-search\*, back-to-top\*, code-block\*, command-palette\*, date-range-picker, detail-layout, dock\*,
field-list, form-actions, form-section, image-gallery, kanban, kanban-column, navbar, page-header\*, pagination, property-grid, side-nav\*,
split-button\*, stepper, table-filters\*, tabs\*, toast-stack, toolbar.
(\* = ambiguous or carries raw-tag debt today; see below.)

**Elements (83):** accordion, accordion-item, alert, app-shell\*, avatar, avatar-group, badge, breadcrumb, button, button-group, calendar, card,
chart, checkbox, cluster, code-view, colour-input, combobox\*, container, context-menu, dialog, divider, drawer, dropdown, dropzone, empty-state,
field, field-row, form, frame, gallery, grid, heading, hint, icon, input, lightbox, link, list, list-group, loading-overlay, local-time, log, media,
menu-item, nav-item, otp-input, pager, popover, progress, radio-group, range, rating, scroll-progress, select, select-menu, skeleton, skip-link,
sortable, sortable-item, spinner, splitter, stack, stat, step, swatch, switch, tab, tab-panel, table, tag, tag-input, text, textarea, timeline,
timeline-item, toast, toc, tooltip, tree, tree-item, unit-input, workspace.

The proposed tiers are a starting point derived from each element's summary, its group and which `pk-*` names its source references (a first
pass, not a measured composition graph; phase 1 produces the measured one).

### Ambiguous and recommended

| Element | Question | Recommendation and reason |
| --- | --- | --- |
| **combobox** | Built from an input plus a listbox, so component? | **Element.** It writes no `pk-*`; it owns an ARIA 1.2 combobox (activedescendant, popup, keys) on raw `input`/`button`/`div`. The "input plus listbox" is an implementation of one control, like `select-menu`. Tier follows construction, not vocabulary. |
| **dashboard-page** | Page, or a composite widget board? | **Page.** It is a screen shape (widgets in `pk-card`, `pk-stat`, `pk-chart`, toolbar); it has a same-named app page type (`core/js/app/pages/dashboard.js`); group is "Page types". The dashboard widget contribution spec adds modules that feed it, which reinforces it as the page. |
| **app-shell** | Page, component or element? | **Element (layout frame), with a named exemption.** It owns the landmarks (`header`, `footer`, the scrolling body) and composes no `pk-*`; the page-level frames are where raw landmarks live. Calling it a component would forbid the very tags it exists to provide. Alternative if the owner prefers: a fifth label `shell` (see open question 3). |
| **workspace / workspace-page** | Two tiers for one idea? | `workspace` element (panes, raw); `workspace-page` page (the page type hosting it). Keep the pair. |
| **tabs** (+ tab, tab-panel) | Parent composes `pk-tab`, `pk-dropdown`, `pk-menu-item` | Family: children are elements; parent **component** because it assembles tabs and an overflow dropdown. Debt: raw `button`/`div` in the strip. |
| **dock** | Panels, splitters, raw `button`/`section` | **Component** (composes `pk-splitter`, tabs), debt on the raw tags. Re-tier to element if it is judged to own the docking behaviour outright. |
| **navbar / side-nav** | Compose `pk-nav-item`, but draw `nav`, `input`, `button` | **Components with debt.** The intent is composition; the raw `nav` landmark is the one allowed exception (a landmark), the raw `input`/`button` are debt. |
| **command-palette** | Raw `dialog` + `input` + list | **Component with debt:** should compose `pk-dialog`, `pk-input`, `pk-list-group`. Today it re-draws them; the audit records this, which is the point. |
| **page-header, toolbar, form-section, form-actions, field-list** | Layout-ish, raw `header`/`h2`/`div` | Components: they should compose `pk-heading`, `pk-breadcrumb`, `pk-cluster`, `pk-stack`. Each raw tag found is debt, not a reason to call them elements. |
| **badge-popover, split-button, back-to-top, app-bar-search, code-block, table-filters** | Compose an existing element but draw raw `button`/`input` | **Components with debt** (should use `pk-button`, `pk-input`, `pk-popover`, `pk-dropdown`). Some may prove to be genuine elements after review (app-bar-search draws a bespoke pill); each decision is an audit result, not a guess. |
| **form, field, field-row** | Wrap `pk-input`/`pk-field` by selector | **Elements.** They query `pk-*` children by name to wire validation; they do not build them. Use of a tag name in a query is not composition. |
| **table, chart, calendar, dropdown, context-menu, popover, dialog, drawer, lightbox** | Complex, but own their tree | **Elements.** Complexity is not composition. |
| **kanban, kanban-column, image-gallery, property-grid, date-range-picker** | Composed of `pk-sortable`, `pk-lightbox`, `pk-popover`, `pk-calendar`, `pk-input`... | **Components.** |

## 3. Mechanism: tag first, folders later

**Recommended: tag now, folders never-or-last.** A tier field in `<name>.meta.json` is one line per element, reversible, and lets the audit prove the
classification before any structure depends on it.

| Concern | Tag-based (phase 1) | Physical folders (later, optional) |
| --- | --- | --- |
| Meta schema | `element-api.mjs` validates `tier` (enum, required) at the same place it validates `group`; it is in the API surface, so `api-surface.mjs` and the scorecard baseline change once. | unchanged |
| Build | `build.mjs` reads `tier` into `elements.json`/gallery data; no path change. Element CSS/JS ordering could follow dependency direction. | `build.mjs`, `element-manifests.mjs`, `gallery-dist.mjs`, `usage-index.mjs` (all enumerate `core/elements/<name>/`), plus `serve.mjs` and `scripts/{build-skills,generate-blazor,ui-review,generated,publish-dist,verify}.mjs` path assumptions. |
| Imports | none | every `../elements/<name>/` import, dist layout, `registry.js`, `elements.css` ordering, SRI manifest. High conflict risk. |
| Browser attestation | `core/tests/browser/cases-*.js` and `report.json` unchanged; optionally report by tier. | per-element case files reference paths; re-attest. |
| Security scan | `security.mjs`/`security.allow.json` keyed by path: unchanged. | every allow entry path changes. |
| Scorecard | adds a by-tier view from the tag. | path-keyed baselines (`baseline.json`, `security.baseline.json`) rewritten. |
| Blazor | `blazor/mappings/<name>.json` unchanged (mapping is by element name; optionally a `tier` field could emit a namespace later). | mapping generation reads `core/elements`; moved paths break `generate-blazor.mjs` and the `Generated/` layout. |
| Skills / docs | skills gain a per-tier rule paragraph; element docs show the tier. | doc generators' globs change. |
| Reversible? | Yes (delete a field). | No, a 120-directory rename that stays in every agent's open branch. |

A folder split also has a semantic cost: `core/modules/` already exists with a different meaning (strict modules, dogfood ruleset). Putting pages
in `core/pages/` next to `core/js/app/pages/` adds a third "pages" location. Recommendation: stay tag-based; revisit folders only if the audit
shows the tag is being ignored.

## 4. Enforcement in audit tooling

The audit has families S (styling/structure), D (discovery/hints), module, and the #392 composition gate. Per-tier rules are a **ruleset selector
by tier**, not new detection code:

- **element tier:** today's behaviour (`core/elements/**` is exempt from S1-S9 and from the composition gate). Add only the dependency-direction
  check: no `pk-*` of a component, page or module tier in an element's sources.
- **component tier:** run **D1** (raw tag with a pk equivalent) and **S3** (classes) as errors against the element's `.html`, `.js` and shadow
  templates, with a baseline (`core/tools/audit/baseline.mjs`) of today's violations so that the gate is "no new debt", exactly how the
  module ruleset started. D1's `TAG_HINTS` already defines the forbidden-tag list; the new piece is pointing D1 at element sources and applying
  the exempt list from section 1 (`slot`, `template`, baselined structural `div`/`span`). S1/S2 (style, CSSOM) apply too; the #392 gate
  (pointer drag, arrow-key nav, focus trap, manual ARIA role) applies to components, since those are the things an element standardizes.
- **page tier:** as component, plus "must not define its own controls": a page that writes `addEventListener('keydown')` or an ARIA role fails the
  #392 gate already once that gate is applied to it.
- **module tier:** exists already (`module-ruleset.mjs`, S1-S12, always error). No change except a label.
- **overlap:** D1 and S3 are reused with their ids and texts (as `module-rules.mjs` already does), not cloned. The only new rules are `C1`
  dependency direction and `C2` "element has a tier". Both are a few dozen lines.

## 5. How this resolves #699

The blur in #699 is that *template*, *pattern* and *page type* describe three different things with one folder of samples. With tiers:

- a **page type** is the page tier (an element or app-page with a fixed shape: `list-page`, `record-page`);
- a **template** is a sample that wires page types into a routed app skeleton (`core/samples/templates/*`): a module-tier or app-level composition, demonstrating how the pieces connect;
- a **pattern** is a sample that shows components composed for one job inside a page (`filter-table`, `master-detail-pattern`).

The four overlapping samples then sort by tier and shape: `templates/crud` (page + dialogs), `templates/routed-list-detail` and `templates/master-detail`
(page-tier `master-detail-page`/`workspace-page` variants), `patterns/master-detail-pattern` (component-level; the near-duplicate of
`templates/master-detail`, fold it). The missing canonical pair (list-page plus record-page, routed) is a template-level composition of two
page types. Tiers do not delete samples by themselves; they give the consolidation a rule: a sample states its tier and shows nothing below it.

## 6. Phased plan (each step releasable, about 400 lines or fewer)

| Phase | Change | Size | Risk |
| --- | --- | --- | --- |
| 0 | Owner decisions (section 7). This document merged. | docs | none |
| 1 | `tier` added to meta schema in `element-api.mjs` (optional first), populated for all 120 `<name>.meta.json` by a one-off script, plus a report-only `node scripts/` tier report (measured composition graph: pk names referenced, raw tags written). Nothing fails. | ~150 hand-written plus 120 one-line meta edits (generated, mechanical) | Touches every element's meta: merge conflicts with any agent editing one. Split into four small PRs by tier if needed, or land at a quiet moment, ordered before other element work. |
| 2 | `tier` becomes required; C1/C2 checks; `api-surface` baseline regenerated in a release PR. | ~120 | Adds an API field: minor version bump. |
| 3 | Component ruleset, report-only with baseline: D1/S3/gate against component sources, baseline = today's debt. | ~250 | Baseline file is large; conflicts if components change concurrently. |
| 4 | Flip to errors (no new debt); pay down baseline entries one component at a time, each its own PR with UI review (raw `button` -> `pk-button` changes looks). | per component, <= 400 | UI regressions; the screenshot and scenario process in AGENTS.md applies. |
| 5 | Docs, skills, gallery: tier shown on element pages and the scorecard by-tier view; `CONTRIBUTING`/STANDARDS paragraph; #699 samples consolidation keyed by tier. | ~300 | none |
| 6 (optional) | Folder move, only if the owner still wants it after phase 4. One mechanical PR per tier, scripted. | scripted | High; see section 3. |

Concurrent-agent conflict risk is concentrated in phases 1 and 4. Mitigation: phase 1 edits only the meta files (agents mostly edit `.js`/`.css`),
is rebased immediately before merge, and any agent rebasing gets a one-line conflict; phase 4 is per component, so it conflicts only with work on that component.

## 7. Open questions for the owner

1. **Tier name for what an element is built from.** Confirm "tier follows construction, not size": `combobox` and `app-shell` are elements.
2. **Structural `div`/`span` in components:** banned outright (every such case waits on a layout element, or uses `pk-stack`/`pk-cluster`), or baselined
   and removed per component? Outright is purer; baselined is shippable. Recommendation: baselined, errors on new.
3. **Is `app-shell` (and `page-header`-style landmark owners) a fifth label (`shell`) or an element with an exemption?** Recommendation: element.
4. **Do pages exist as two forms (element and `core/js/app/pages/*.js`) under one tier, or are the app page types their own tier?**
   Recommendation: one tier, the JS form is the page's framework face.
5. **Module tier in `core/elements`:** none qualify today. Keep `core/modules` and the app framework as the module tier, and forbid `tier: module` in an element's meta?
6. **Folders:** drop the folder migration from scope (recommended), or keep it as an optional phase 6?
7. **Blazor:** should the tier show in generated wrappers (a namespace or doc tag), or stay internal?
8. **Enforcement severity on release:** component-tier debt baseline errors on new debt only (recommended), or is a clean baseline a precondition?
