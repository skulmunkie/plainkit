# pk-dock panel declaration (#590) and pk-workspace versus pk-dock (#593): decisions for the owner

Status: proposal for owner decision, no product code. Date: 2026-11-21. Tree: `origin/main` at `5518c63a`.
It builds on `2026-10-19-dockable-workspace-design.md` (sections 4.1, 4.2 and 14), which recommended "slotted, no factory" and "keep both" with
mechanical criteria still to be measured. This note measures what can be measured cheaply, argues each case against the alternatives, and
asks for the two decisions. Size budgets are being rethought (interim: measured +1 %); the recommendations below are not driven by a byte
budget, the byte effects are stated so the owner can see them.

## 0. What the code does today (grounding)

- **Panels are discovered** by `readPanels(this.children)` in `core/components/dock/dock.js`: every direct child with a valid `slot` (lowercase id,
  up to 40 characters, not `empty` or `toolbar-start`), in DOM order; `data-heading`, `data-group` and the read-only `data-*` options come from the
  child. A `MutationObserver` on children and on `slot`, `data-heading`, `data-group` re-runs `updated()`.
- **Nothing is instantiated by the dock.** The host created every panel node (and everything inside it) before the dock sees it. The dock renders
  `<slot name="<id>">` inside each tab panel, so inactive tabs' content stays live in the light DOM (hidden by the shadow tab panel, not removed).
  A closed panel stays a host child but is left out of the layout (`$closed`), so it also stays live and keeps its state.
- **The layout JSON never contains content**, only ids: `{ version, seq, root, collapsed }` with `tabs.panels` as id lists. `fromJson` already drops
  undeclared ids and adds new ones, so a panel appearing or disappearing is already a supported event. Persistence (`persistKey`) therefore does
  not depend on how a panel is declared.
- **Blazor.** `PkDock` has `ChildContent` for the panels (any child with `slot="<id>"`), plus `EmptyContent` and `ToolbarStartContent`. A
  `RenderFragment` is already lazy in Razor: `@if (visible) { <div slot="log">...</div> }` creates the component only when the condition holds,
  and the dock reacts to the node appearing. Controlled mode (`ConfirmLayout`) and methods (`OpenPanelAsync`, ...) exist.
- **Consumers of `pk-dock` in the repository** are its tests, review scenarios (`dock`, `dock-declare`, `canvas-in-dock`), browser cases
  (`cases-dock.js`) and the docs and guides. There is no product page, module or sample that mounts it. (`pk-tool-dock` is a different thing: one
  floating panel with a tab strip, and it already takes `mount(element, context)` factories with `activate` and `deactivate`.)
- **Consumers of `pk-workspace`**: the `workspace-page` page type (`core/pages/workspace-page`, page type `workspace`), the `workspace` and
  `routed-list-detail` templates, the code-explorer module, the guides, and a Blazor `PkWorkspace` plus `PkWorkspacePage`.
- **Measured source size** (gzip -9 over the unminified source files; a ratio guide, not the shipped bytes): `pk-dock` is 29.8 KB across
  `dock.js` (5.2) and eight `core/js/dock-*.js` modules (22.7 in all), plus `dock.css` 1.9. `pk-workspace` is `workspace.js` 1.9 plus `workspace.css` 1.4, 3.3 KB.
  The dock ships in the optional package `plainkit.dock`; the workspace ships in core.
- **Not measured**: memory and startup cost of upfront panel content. That cost is whatever the host's panels cost, not the dock's, so a
  dock-level number would be synthetic. Step 2 of section 1.5 is the one measurement that would settle it (a real panel set).

## 1. #590: how a panel is declared

### 1.1 The real question

"Slotted children versus a factory" mixes two questions: **who owns the panel DOM** (host or dock) and **when is it created**. The first has
a strong answer from the ownership rules; the second is a feature request with no evidence behind it yet.

### 1.2 Options

- **A. Keep slotted light-DOM children (as shipped).** The host owns the nodes; the dock slots them.
- **B. Factory callback.** `dock.panels = [{ id, title, group, mount(el, ctx) }]`; the dock creates a container and calls `mount` when first shown
  (the shape of `mountToolDock`'s panels).
- **C. Slotted children plus an opt-in lazy flag.** A panel carries `data-lazy` and holds an inert `<template>`; the dock stamps the
  template on first show and fires `pk-dock-panel-shown`. Eager panels are unchanged.
- **D. Registry of named factories.** Modules register `defineDockPanel('log', factory)`; markup says `<div slot="log" data-panel="log">`.

### 1.3 Comparison

| Criterion | A slotted (today) | B factory | C slotted + lazy template | D registry |
|---|---|---|---|---|
| Who owns the panel DOM | host (matches STANDARDS "host owns light DOM") | dock creates, host called back | host owns the node, dock stamps into it (risk R1) | dock creates |
| Panel content created when | page build (all) | first show | first show, for opted-in panels | first show |
| State across moves (value, scroll, focus) | kept, the node is never moved | kept only if the dock keeps containers alive | kept after first stamp | as B |
| Declarative and auditable in markup | yes | no (script only) | yes | partly |
| Layout JSON and `persistKey` | works | works, but ids must come from the callback list before content exists | works | works |
| Blazor (thin 1:1) | `ChildContent`, already lazy via `@if` | needs a callback into a JS-owned element: interop heavy, against the wrapper rules | Blazor cannot render into inert template content | needs a JS registry, no Razor spelling |
| New public API | none | one prop, one callback contract, lifecycle (`activate`, `deactivate`, `destroy`) | one attribute, one event | a global registry |
| Bytes in `plainkit.dock` (estimate, gzip) | 0 | about 0.4 to 0.6 KB | about 0.2 to 0.3 KB | about 0.3 KB plus registry |
| No-JS or pre-upgrade content | present | absent | present but inert | absent |
| Fixes a measured problem today | n/a | none shown | none shown | none shown |

### 1.4 Recommendation

**Keep A as the one stable declaration API. Do not build B or D. Build C only when a measured case needs it, and write the trigger down now.**

1. **Ownership.** The standard says the host owns attributes and light-DOM children. A factory makes the dock the owner of panel DOM, and the
   ownership tests are built around the opposite. A factory also turns a markup-level layout into a script-only one, which weakens the audit and the agent skills (agents read markup).
2. **Blazor.** The wrapper rule is thin 1:1. Slotted children map to `ChildContent`; laziness already exists there as ordinary Razor
   (`@if`) and the dock handles a panel appearing. A factory callback has no good Razor spelling.
3. **State.** The dock's promise ("slotted, never moved, so form and scroll state survive every move") is the feature people notice. B
   weakens it unless the dock also keeps containers alive, which is A again with more code.
4. **No evidence.** No in-repo product consumer exists, and inactive-tab content staying live is the same cost every `pk-tabs` page pays. The
   expensive case is real (a code editor or canvas in a rarely opened panel) but is solvable at the host: add the child when its tab is first
   activated (JS: on `pk-layout-change` or the tab event; Blazor: `@if`). That already works and is documented nowhere; documenting it is the cheapest step.
5. **C stays available** because it is additive, small and declarative. Its one real defect (R1) is why it waits for evidence.

Trigger for building C (owner to set the numbers): a real consumer where upfront content of a panel hidden at load costs more than, suggested,
50 ms of main-thread time or 5 MB retained, with the host-side pattern shown not to be enough.

### 1.5 Steps (each about 400 lines or less)

1. **Docs and gallery (about 150 lines, no product code).** Document the "create the panel when first shown" pattern (JS and Blazor) in the dock guide and
   a gallery example; add a browser case that appends a panel node after first draw and asserts the layout repairs and the node keeps its slot; add the
   line to the skills' workflow in `scripts/skills/`. Changelog fragment (notes).
2. **Measure (about 100 lines of script kept in scratch, results posted on the issue).** One page with a realistic heavy panel (a `pk-canvas`, a
   `pk-table` of 5k rows) docked three ways; record time to first draw and retained memory, panel eager versus appended on first show.
3. **Only if the trigger is met, option C (about 250 lines).** `data-lazy` on a panel holding one `<template>`; the dock stamps it the first time its group
   shows it and emits `pk-dock-panel-shown` `{ panel }`; `blazor/mappings/dock.json` gains event `OnPanelShown` (no lazy fragment in Blazor, use `@if`); skills and gallery sample; a browser case measuring that the template content is absent before and present after. R1 is argued in that PR.

### 1.6 Risks

- **R1 (option C only).** Stamping content into a host-owned node breaks "the host owns light-DOM children" on its face. Mitigation: the stamped
  content goes in a wrapper the dock creates, or the host stamps it on the event. Decide in step 3.
- **R2.** A host that creates panels late may flash an empty group; the empty slot and a panel appearing are already handled.
- **R3.** Doing nothing leaves heavy hidden panels costing their full price. The step-2 measurement bounds how bad this is.

### 1.7 Questions for the owner (#590)

1. Confirm slotted light-DOM children as the one stable panel declaration API (no factory callback, no registry)? Recommended: yes.
2. Approve step 1 (document and test the "host creates the panel on first show" pattern, JS and Blazor) as the answer to the laziness concern for now? Recommended: yes.
3. Approve step 2 (measure a real heavy panel set) before any lazy flag is designed? Recommended: yes.
4. Set the trigger for option C (suggested 50 ms or 5 MB retained for a panel hidden at load, in a real consumer)? Recommended: yes, with the suggested numbers.
5. If C is ever built, may the dock write into a slotted node's children (R1), or must stamped content go in a dock-created wrapper? Recommended: wrapper.

## 2. #593: pk-workspace versus pk-dock

### 2.1 What each is

| | `pk-workspace` | `pk-dock` |
|---|---|---|
| Tier and package | `element` (core) | `component` (`plainkit.dock`) |
| Layout | three fixed panes: `nav`, main, `aside`; CSS; `navWidth` | tree of resizable splits and tab groups, one JSON layout |
| User can resize, tab, move, float, collapse | no | yes |
| State | `activePane`, `asideOpen` | `layout` JSON, `persistKey`, `confirmLayout`, methods |
| Phone | a three-tab strip, one pane at a time; labels `navLabel`, `mainLabel`, `asideLabel`; cancelable `pk-pane-change` so a router can own the pane | one tab strip of every open panel in reading order; no move targets |
| Routing integration | yes (`routed-list-detail` cancels `pk-pane-change` and changes the route) | none |
| Panel declaration | named slots `nav`, default, `aside` | slot per panel id plus `data-*` hints |
| Source gzip (unminified, ratio guide) | 3.3 KB | 29.8 KB |
| Consumers | workspace page type, two templates, code-explorer module, Blazor `PkWorkspace` and `PkWorkspacePage` | none outside tests, scenarios and docs |

### 2.2 Duplication, counted honestly

- **Shared by intent:** the phone breakpoint (`mediaBelow('phone')`), the `fill` property, a tab strip for the phone, an ARIA tab and region pairing.
- **Shared in code today:** only `js/breakpoints.js`. The workspace builds its own strip; the dock uses `pk-tabs`. The workspace is `tier: element`,
  so by the composition tiers (C4) it renders no `pk-*` and cannot reuse `pk-tabs`; that rule is why the two strips are not one.
- **What could move to a shared module** if both stay: `paneKey` (arrow, Home, End across tabs) is about 10 lines; `availablePanes` and
  `resolvePane` are workspace-specific. The honest shared volume is under 0.3 KB gzip, so consolidating by sharing code buys almost nothing.
- **Different jobs:** the workspace is a page shell whose panes are fixed roles a router can own; the dock is a user-arranged workbench. Their
  phone semantics differ on purpose (a named pane per role versus a flat list of whatever is open).

### 2.3 Options

- **A. Keep both** with distinct jobs written into the choosing guide, revisit on evidence.
- **B. Dock subsumes workspace.** A `preset="workspace"` dock reproduces three panes with resize and tabs off. `pk-workspace` becomes an alias (additive), then deprecated, then removed.
- **C. Workspace subsumes dock.** Add resize, tabs and a layout document to the workspace. Rejected: the cheap element would carry the dock and leave tier `element`.
- **D. Keep both and share code.** Move the generic strip key handling into one core js module. Cheap, small win.

### 2.4 Comparison

| Criterion | A keep both | B dock subsumes | C workspace subsumes | D keep and share |
|---|---|---|---|---|
| Bytes for a page needing only fixed panes | 3.3 KB | about 29.8 KB plus package (about 9x) | 3.3 KB plus about 25 KB | about 3.0 KB |
| Package impact | none | core pages depend on the optional `plainkit.dock` (or the dock moves into core) | workspace leaves the cheap tier | none |
| Phone semantics | both kept | the dock needs a named-pane mode and the route-owned pane | n/a | both kept |
| Routing hook (`pk-pane-change` cancel) | kept | must be ported | kept | kept |
| API surface | two small | one large, presets | one large | two small |
| Blazor | two thin wrappers exist | `PkWorkspace` and `PkWorkspacePage` become wrappers over `PkDock` or are removed (breaking) | as B | unchanged |
| Migration cost | none | alias, deprecation window, three templates, a page type, code-explorer, docs, skills, Blazor | larger than B | one small PR |
| Consolidate-before-adding rule | satisfied (adds nothing) | satisfied in principle | not | satisfied |
| Main risk | two things to teach (mitigated by guide) | a content shell pays for a workbench; phone semantics regress | element tier lost | low |

### 2.5 Recommendation

**Keep both (A), optionally share the small common piece (D), and write down the rule that separates them. Do not combine now.**

1. Combining costs a lot (about 9x for the simplest consumer, an optional package pulled into core pages, the route-owned phone behaviour
   ported) and gains little: shared code is under 0.3 KB, the API surface would not shrink, and the dock has no product consumer a merge would simplify.
2. The consolidation rule is about not adding elements; this adds none, and the two answer different questions. The choosing guide already has the row; make it the stated rule:
   if the user never needs to resize, tab, move or save the arrangement, use `pk-workspace`.
3. **Revisit triggers (mechanical):** combine when any holds: (a) a real page nests a dock inside a workspace, or needs both a fixed shell and user
   rearrangement; (b) the dock moves into core and is under 2x the workspace's cost minified; (c) a third pane-like element is proposed.
4. If triggered, the path is additive: `pk-dock preset="workspace"` with the workspace untouched; a deprecation window of two minor releases with a
   `compat-warn` message pointing to the preset; removal with a `breaking` fragment and a Blazor note. Not started now.

### 2.6 Steps (each about 400 lines or less)

1. **Guide and skills (about 80 lines, docs only).** The decision rule in `choosing-what-to-build-with`; the two meta summaries cross-reference each other; one line in the skills' workflow.
2. **Share the strip key handling (about 120 lines, optional).** Move the generic arrow/Home/End logic into a core js helper the workspace uses. Touches an element, so it needs a phone-strip UI review; the changelog uses `no-changelog` with the reason.
3. **Detect the revisit trigger (about 60 lines).** A test in `scripts/tests/` that fails when a page or template contains both `pk-workspace` and `pk-dock` (trigger a), so the condition is noticed rather than remembered.
4. **If triggered:** a separate spec for the preset (additive alias, deprecation, Blazor), one PR per stage.

### 2.7 Risks

- **R4.** Two elements keep two phone strips with different semantics. Mitigation: the guide row and both summaries state the difference.
- **R5.** The dock has no product consumer, so its upkeep (about 30 KB gzip of source, a 718-line test file, three scenarios) feels no pressure.
  Mitigation: step 3, and the layout workbench spec (`2026-11-13-layout-builder-workbench.md`) as a first real consumer.
- **R6.** If one pane element is wanted later, the cost of combining grows with consumers; the triggers exist to catch that early.

### 2.8 Questions for the owner (#593)

1. Keep `pk-workspace` and `pk-dock` as two elements with distinct jobs (no combination now)? Recommended: yes.
2. Adopt the rule "use `pk-workspace` unless the user needs to resize, tab, move or save the arrangement" in the guide and skills (step 1)? Recommended: yes.
3. Do step 2 (share the strip key handling), or skip it as too small for a UI-reviewed PR? Recommended: skip unless other work touches the workspace.
4. Approve the revisit triggers (a, b, c in 2.5) and the detecting test (step 3)? Recommended: yes.
5. If the dock ever subsumes the workspace, is the path additive preset, two minor releases of deprecation, then a breaking removal acceptable? Recommended: yes.
6. Should the dock move into core if it gains its first product consumer (the layout workbench)? Recommended: decide in that spec, not here.

## 3. Summary

| Issue | Recommendation | First PR |
|---|---|---|
| #590 | Slotted children stay the one API; no factory; lazy template only on measured evidence; document host-side lazy creation now | docs and a browser case, about 150 lines |
| #593 | Keep both; write the separating rule; mechanical revisit triggers; combine only by an additive `preset` if triggered | guide and skills, about 80 lines |
