# Composition tiers: element, component, page, module (design)

Status: owner decisions applied (section 7). Design only: no code, no folder moves, no audit rules land with this document.
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
| **page** | A page type: a whole screen shape (list, record, settings, dashboard, wizard) assembled mostly from components. Element form (`pk-list-page`) and app framework form (`core/js/app/pages/list.js`) are one concept in two locations, tied by `tier: "page"` plus a `pageType` meta field (for example `list`) that names the factory; a test asserts each page element has exactly one factory and each factory one element. | Components and elements, page-level slots. | Raw tags; drawing its own controls. |
| **shell** | The frame that owns the viewport and the page landmarks (`pk-app-shell`; `pk-os` later): it hosts pages, it is not a page. | Raw landmarks (`header`, `footer`, `nav`, `main`), the scrolling body, viewport sizing, focus/skip-link wiring, in its own shadow tree; `pk-*` components for its chrome. | Define a screen shape (that is a page); be hosted inside a page or component; raw tags other than the landmark and layout set. Only one shell is active per document. |
| **module** | A behaviour bundle mounted into a page or the dock (`core/modules/*`, app framework `defineModule`): expose functionality for a purpose, built from components. Not necessarily a custom element. | Components, elements, page types, framework services. | Raw tags, classes, styles, raw interaction plumbing (existing strict-module rules S1-S12 and the #392 gate). |

Dependency direction is one way: module -> shell -> page -> component -> element (a shell hosts pages; modules mount into pages or the shell). `tier: "module"` is forbidden in an element meta: modules live in `core/modules` and the app framework. An element never names a component, page or module tag. Enforced by
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
the one judgment area (a component that needs a landmark usually means the landmark belongs in a shell (`pk-app-shell`) or `pk-page-header`).

An **element** may use any raw tag; it should still use a lower `pk-*` element when one exists (a `pk-select` that re-draws `button` is fine; a
`pk-date-range-picker` that draws `input` is not).

## 2. Classification of all 120 current elements

Rules of thumb applied: (a) family parents that own interaction (tabs' keyboard, tree roving focus, sortable drag) are elements; (b) a thing that
owns its ARIA pattern on raw tags is an element however complex (`combobox`); (c) "Page types" group in `.meta.json` maps to pages; (d) a thing whose
source mostly writes `pk-*` but currently also writes raw `button`/`input` is a **component with baselined debt**, not an element: the tier states
the intent, the audit tracks the debt. Counts: 91 elements, 16 components, 12 pages, 1 shell, 0 modules in `core/elements/` (modules already have their own
folder and ruleset; see section 3).

**Shell (1):** app-shell.

**Pages (12):** dashboard-page, doc-page, list-page, master-detail-page, not-found-page, note-page, record-page, settings-page, states-page,
tool-page, wizard-page, workspace-page.

**Components (16):** app-bar-search\*, date-range-picker, detail-layout, dock\*,
field-list, form-actions, form-section, image-gallery, kanban, kanban-column, page-header\*, property-grid,
stepper, tabs\*, toast-stack, toolbar.
(\* = ambiguous or carries raw-tag debt today; see below.)

**Elements (91):** (82 at the first classification, plus back-to-top, badge-popover, code-block, command-palette, navbar, pagination, side-nav, split-button and table-filters, re-tiered in #736 because each is built only from raw HTML and renders no other `pk-*` element; the owner constraint is that an element is composed of base building blocks only) accordion, accordion-item, alert, app-shell\*, avatar, avatar-group, badge, breadcrumb, button, button-group, calendar, card,
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
| **app-shell** | Page, component or element? | **Shell (owner decision).** It owns landmarks and the viewport and composes no other pk-*; rules in section 1, "Shell". `pk-os` may become a second shell. |
| **workspace / workspace-page** | Two tiers for one idea? | `workspace` element (panes, raw); `workspace-page` page (the page type hosting it). Keep the pair. |
| **tabs** (+ tab, tab-panel) | Parent composes `pk-tab`, `pk-dropdown`, `pk-menu-item` | Family: children are elements; parent **component** because it assembles tabs and an overflow dropdown. Debt: raw `button`/`div` in the strip. |
| **dock** | Panels, splitters, raw `button`/`section` | **Component** (composes `pk-splitter`, tabs), debt on the raw tags. Re-tier to element if it is judged to own the docking behaviour outright. |
| **navbar / side-nav** | Draw `nav`, `input`, `button`; `pk-nav-item` is only looked up (side-nav) or supplied by the host | **Elements (re-tiered in #736).** Previously components with debt. The intent is composition; the raw `nav` landmark is the one allowed exception (a landmark), the raw `input`/`button` are debt. |
| **command-palette** | Raw `dialog` + `input` + list | **Element (re-tiered in #736).** Was a component with debt: should compose `pk-dialog`, `pk-input`, `pk-list-group`. Today it re-draws them; the audit records this, which is the point. |
| **page-header, toolbar, form-section, form-actions, field-list** | Layout-ish, raw `header`/`h2`/`div` | Components: they should compose `pk-heading`, `pk-breadcrumb`, `pk-cluster`, `pk-stack`. Each raw tag found is debt, not a reason to call them elements. |
| **badge-popover, split-button, back-to-top, app-bar-search, code-block, table-filters** | Compose an existing element but draw raw `button`/`input` | **badge-popover, split-button, back-to-top, code-block, table-filters were re-tiered to elements in #736** (they render no `pk-*`); app-bar-search stays a component (its template renders `pk-button`). Originally: components with debt (should use `pk-button`, `pk-input`, `pk-popover`, `pk-dropdown`). Some may prove to be genuine elements after review (app-bar-search draws a bespoke pill); each decision is an audit result, not a guess. |
| **form, field, field-row** | Wrap `pk-input`/`pk-field` by selector | **Elements.** They query `pk-*` children by name to wire validation; they do not build them. Use of a tag name in a query is not composition. |
| **table, chart, calendar, dropdown, context-menu, popover, dialog, drawer, lightbox** | Complex, but own their tree | **Elements.** Complexity is not composition. |
| **kanban, kanban-column, image-gallery, property-grid, date-range-picker** | Composed of `pk-sortable`, `pk-lightbox`, `pk-popover`, `pk-calendar`, `pk-input`... | **Components.** |

## 3. Mechanism: tag first (proves the tiers), then a mechanical folder move

Both are in scope, in this order. The tag is reversible and proves the classification; the move then follows tier boundaries mechanically.

### 3.1 Step one: a `tier` field in `<name>.meta.json`

`element-api.mjs` validates `tier` (enum element, component, page, shell; `module` rejected) next to `group`; `build.mjs` carries it into the element
index and gallery data; `api-surface.mjs` and the scorecard baseline change once. No import path changes.

### 3.2 Step two: target tree

```
core/elements/<name>/     tier element
core/components/<name>/   tier component
core/pages/<name>/        tier page (element form; the JS factories stay in core/js/app/pages, tied by pageType)
core/shells/<name>/       tier shell
core/modules/             unchanged (modules)
```

Each folder keeps the present layout (`<name>.html/.css/.js/.meta.json/.test.mjs`). `tier` stays in the meta and a test asserts it equals the
parent folder, so the two cannot drift.

### 3.3 What the move touches, and the compat story

| Concern | Change |
| --- | --- |
| `build.mjs` `loadElementSources` | reads `elements/`, `components/`, `pages/`, `shells/` (one loop over a `TIER_DIRS` list) instead of one dir; `meta.tag === pk-<name>` check unchanged; name collisions across tiers fail the build. |
| Generated files | `core/elements/<name>.element.js`, `registry.js`, `elements.css` are generated into `core/elements/`; generated output keeps its **current location and shape** so the loader and every import of them is unchanged. Only the source folders move. |
| **Shipped dist** | `dist/elements/<name>.js`, `dist/plainkit.css`, `dist/js/`, `dist/manifest.json` and the registry are **unchanged**; the spec does not propose any dist change. A test compares the dist file list before and after each batch. |
| `element-api.mjs`, `element-manifests.mjs`, `gallery-dist.mjs`, `usage-index.mjs`, `serve.mjs` | path globs go through one shared `elementDirs()` helper introduced in phase 2 (before any move), so a batch moves files and changes no tooling. |
| Node tests (`core/elements/*/*.test.mjs` glob in `scripts/verify.mjs`, CI, AGENTS.md) | glob extended to the new folders; relative imports inside element sources (`../../js/...`) gain one `..` level only if the folder depth changes; pick the same depth (`core/<tier>/<name>/`) so they do not. |
| Browser attestation | `cases-*.js` address elements by tag; `report.json` re-attested once per batch (the attestation rule already requires it when element sources move). |
| Security scan | `security.allow.json`, `security.baseline.json` and `composition.allow.json` are keyed by path: rewritten by script in the batch that moves the file. |
| Scorecard / api baseline | path-keyed baselines rewritten by the same script; the by-tier view is added. |
| Audit | rule scoping by path becomes scoping by tier (section 4); `module-ruleset` and `core/modules` unchanged. |
| Skills, docs, samples, site | doc generators and `scripts/build-skills.mjs` globs; docs links to `core/elements/<name>` are rewritten by script. |
| **Blazor (same organization as core)** | `blazor/mappings/<tier>/<name>.json` (same folders: elements, components, pages, shells); `generate-blazor.mjs` reads the tier from the mapping path and emits wrappers into `Generated/<Tier>/` with namespace `PlainKit.Blazor.<Tier>` (Elements, Components, Pages, Shells). Razor class names and tag names do not change; to keep consumers compiling the existing flat namespace `PlainKit.Blazor` gets `global using` aliases for one minor version, marked obsolete in the next. Wrapper file tests, `PlainKit.Blazor.csproj` and `scripts/check-package.mjs` (package contents) updated. |
| Compat for outside code | anyone importing `elements/<name>/<name>.js` source paths (not dist) breaks; the repository has none outside tests, samples and site, all rewritten by script. A one-release stub list is not needed because nothing source-side ships. |

### 3.4 Batching and the freeze

One batch per tier, scripted (`git mv` plus the rewrite script, reviewed as a rename diff), in this order: shells (1 element), pages (12), components (16),
elements (91, the remainder, only if the parent folder keeps the name `elements`; 91 elements stay where they are, so this batch is empty: the
element tier does not move at all). The big win of this layout: **91 of 120 elements never move.**

Coordination: a batch is announced on #736 a day ahead; during the batch window (target under 2 hours, merged same day) open agents working on
an element of that tier rebase after merge; `git mv` keeps history and rename detection resolves most conflicts. Paths that other agents' branches
modify are listed by the script (`git branch -r --no-merged` against the batch's file list) so the owner can see exposure before merging. No
freeze on other tiers is needed; the freeze applies only to the tier being moved.

## 4. Enforcement in audit tooling

The audit has families S, D, module and the #392 gate. Per-tier rules are a **ruleset selector by tier**, not new detection code:

- **element:** today's behaviour (`core/elements/**` is exempt from S1-S9 and the composition gate) plus the dependency-direction check (no `pk-*` of a higher tier).
- **component:** **D1** (raw tag with a pk equivalent, `TAG_HINTS`) and **S3** (classes) as errors against the component's sources, S1/S2 too, with a baseline of today's debt (`core/tools/audit/baseline.mjs`) so the gate is "no new debt". The #392 gate applies too. Rule T1 flags an unnamed structural `div`/`span` (no `part`, `slot` or `role`, not a `<slot>` wrapper), baselined and removed per component; a named part or slot host is exempt because other code addresses it (owner decision, #736).
- **page:** as component; additionally no own controls (the #392 gate).
- **shell:** D1/S3 run with the landmark and layout exemption (`header`, `footer`, `nav`, `main`, `div`, `span`, `slot`); viewport ownership (100dvh, scroll container, skip link) is allowed only here, and a check flags `100vh`/scroll-lock code in any other tier.
- **module:** exists (`module-ruleset.mjs`, S1-S12). Only a label.
- Reuse: D1 and S3 keep their ids and texts (as `module-rules.mjs` does). New rules: `C1` dependency direction, `C2` tier present and equal to its folder, `C3` one element per page factory.

Go-live gate (owner decision): **no new debt, plus a measurable reduction of the baseline** (for example each of the first N PRs removes at least one entry, and the scorecard shows the count dropping). A clean baseline is not required.

## 5. How this resolves #699

The blur is that *template*, *pattern* and *page type* describe three things with one folder of samples. With tiers:

- a **page type** is the page tier (`list-page`, `record-page` and their `core/js/app/pages` factories);
- a **template** is a sample wiring page types into a routed app skeleton (`core/samples/templates/*`): app-level composition;
- a **pattern** is a sample showing components composed for one job (`filter-table`, `master-detail-pattern`).

`templates/crud`, `templates/routed-list-detail` and `templates/master-detail` sort as page-tier shapes; `patterns/master-detail-pattern` is the component-level
near-duplicate of `templates/master-detail` and is folded. The missing canonical pair (list-page plus record-page, routed) is a template of two page types.
A sample states its tier and shows nothing below it.

## 6. Phased plan (each step releasable, at most 400 hand-written lines; scripted rename and meta edits are mechanical and listed separately)

| Phase | Change | Hand-written | Risk |
| --- | --- | --- | --- |
| 0 | Merge this spec. | docs | none |
| 1 | `tier` optional in `element-api.mjs`; one-off script writes it into all 120 meta files (mechanical); report-only tier report (measured composition graph). Nothing fails. | ~150 + 120 one-line edits | touches every meta: conflicts with any agent editing one meta; land it at a quiet moment, rebase right before merge. Split by tier if needed. |
| 2 | `tier` required; `module` rejected; `C1`, `C2`, `C3`; `pageType` field on the 12 pages; api baseline refreshed in a release PR. Also the shared `elementDirs()` helper (no move yet). | ~300 | adds API field (minor bump) |
| 3 | Component ruleset report-only with baseline (D1, S3, S1/S2, gate); shell rules; scorecard by-tier view. | ~350 | large baseline file, conflicts if components change concurrently |
| 4 | Go-live: errors for new debt; baseline reduction begins, per component PRs (UI review applies because `button` -> `pk-button` changes looks). Runs in parallel with 5-7. | per component <= 400 | UI regressions |
| 5 | Move batch A: `core/shells/` (app-shell), plus `core/pages/` (12); build.mjs, tests glob, attestation, baselines rewritten by script; dist file list unchanged (test). | ~200 + scripted renames | conflicts on page elements; announce, same-day merge |
| 6 | Move batch B: `core/components/` (16), same script. | ~100 + scripted renames | conflicts on the 25; per-batch window |
| 7 | Blazor mirrored: mappings in `<tier>/` folders, `Generated/<Tier>/`, namespaces, `global using` compat aliases, package check. Can ship right after each core batch if the generator reads tier from the mapping. | ~350 | public .NET API surface: namespace aliases; needs its own minor version note |
| 8 | Docs, skills, gallery show tier; STANDARDS/CONTRIBUTING paragraph; #699 samples consolidation keyed by tier. | ~300 | none |

Elements stay in `core/elements/` (91 of 120), so no element-tier batch exists. Conflict risk with concurrent agents concentrates in phase 1 (all metas), and in batches A and B for only 29 elements.

## 7. Open questions: resolved (owner decisions)

1. Tier follows construction, not size: `combobox`, `form`, `field`, `field-row` stay elements. **Resolved.**
2. Structural `div`/`span` in components: baselined, then removed per component. **Resolved.** Amended: T1 no longer flags a `div`/`span` that is a named part, a slot host or carries a role (#736); only unnamed wrappers remain debt.
3. A fifth tier, **shell**, added: `app-shell` first; `pk-os` may become one. Rules and how it differs from a page in section 1. **Resolved.**
4. Pages are one tier across the element form (`pk-*-page`) and the `core/js/app/pages` factories, tied by `tier: "page"` and a `pageType` field (checked by `C3`). **Resolved.**
5. `tier: module` is forbidden in `core/elements` meta; modules live with the app framework and `core/modules`. **Resolved.**
6. Physical folders are in scope: tag first, then per-tier moves (section 3), dist shape unchanged. **Resolved.**
7. Blazor is organized exactly like core (mappings, generated wrappers, namespaces), phase 7. **Resolved.**
8. Go-live gate: no new debt plus a measurable baseline reduction; a clean baseline is not required. **Resolved.**

Remaining small choices for the implementer (not blocking): folder name for shells (`core/shells/`), and whether `pageType` is a meta field or derived from the tag.
