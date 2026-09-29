# Generalizing the dev tools dock into a reusable `mountToolDock` module

Status: proposed design for owner review, not yet planned or implemented. Refs #644.

## Problem

`mountDevTools({ mode: 'dock' })` (`core/modules/devtools/devtools.js`) is the only "floating/docked tabbed panel" surface in PlainKit
today, and it is hardcoded to the dev tools' own tab set (Console, Logs, Logging, Performance, Quality, Inspector, Theme, Layout builder,
plus the Blazor-only Blazor/Components tabs). The floating-panel-with-tabs-and-a-hotkey behavior it implements — dock to an edge, resize
between named sizes, toggle with a hotkey, pin open/closed, run inline filling a container — is generic. A consuming app that wants "a
canvas/record/page as the main surface with tool-type panels (properties, history, an outline, a console, a chat) docked around or under
it" has no way to reach that behavior without either reinventing it or awkwardly repurposing `mountDevTools` itself.

Issue #644 asks to lift that behavior out from under `modules/devtools` into a standalone module any app can point at its own content,
with `mountDevTools` becoming a thin consumer of it, plus a Blazor wrapper.

### The naming collision (resolve first)

The issue's suggested names, `pk-dock` / `PkDock`, are already taken. `core/elements/dock/` ships a **custom element** `pk-dock` (shipped
in release 0.8.0-alpha.1, commit 879ec02, "pk-dock release: move-panel, close/reopen, controlled mode, layout-builder rewire,
drag-to-dock, header-collapse, collapse-to-rail, persist-key, floating-panel model") that implements the dock-tree design from
`docs/superpowers/specs/2026-09-28-dockable-layout-design.md`: a fixed *workspace* of resizable splits and tab groups
(Toolbox | Canvas | Properties), with a `dock-model.js` tree, drag-to-dock, floating panels within the workspace's own bounds, and a
Blazor `PkDock`/`PkDockPanel` pairing already implied by that design. It answers issue #432, a different problem: arranging several
panels of *page content* against each other inside one region.

What #644 asks for is a different, older pattern that already exists in `mountDevTools`: **one tabbed panel that floats over the whole
page** (or fills a container), toggled by a hotkey, docked to a single outer edge, resizable between three named heights, pinned
open/closed — the "browser dev tools" pattern, not a workspace of panes. It never arranges multiple panels against each other; it is
one panel with a tab strip inside it. Reusing `pk-dock`/`PkDock` for this would mean two unrelated things share one name across the
element list, the Blazor component list, the docs and the skills — a maintenance and discoverability hazard the issue itself flags as
something to resolve, not paper over.

**Decision: do not use `pk-dock` or `PkDock` for this.** See "Naming" below for the chosen name and the alternatives considered.

## Goals

- Extract `mountDevTools`'s floating/docking/resize/hotkey/pin machinery into a standalone module with a generic `panels` option, usable
  by any consuming app (vanilla SDK or Blazor) for its own content.
- `mountDevTools` becomes a thin consumer: its built-in tabs (`BUILT_IN` in `devtools.js`, plus `panels.js`) become the `panels` array it
  passes to the new module, unchanged in shape.
- No regression to `mountDevTools`'s existing public API, DOM shape, events, or behavior for its current consumers (below).
- A Blazor wrapper alongside `PkDevTools`, following the same JS-bridge pattern `PkDevTools`/`PkDevToolsHost` already use.

## Non-goals

- No new panel *types* or UI beyond what `mountDevTools` already has today (no drag-to-dock, no multiple simultaneous edges, no floating
  sub-panels within the dock, no arranging panels against each other). Those are `pk-dock`'s problem (#432), already shipped.
- Not a replacement for `pk-dock`/the dock-tree model; the two stay separate primitives with separate names, as decided above.
- No change to `pk-tabs`, `pk-button`, `pk-button-group` or any element the current implementation composes from.
- No change to the dev tools' actual tab content (console, logs, quality, inspector, theme, layout builder, or the Blazor-only tabs) —
  only where the floating/docking shell that hosts them lives.
- No persistence of open/pinned/tab state across reloads (`mountDevTools` has none today; out of scope to add here).
- No new placement options beyond what exists (`bottom` today, `pk-dock`-style `left`/`right` were floated in the issue text but
  `mountDevTools` only implements `bottom`; see open question 3 on whether to add `left`/`right` in this step or a follow-up).

## Current implementation (read in full for this design)

`core/modules/devtools/devtools.js` (134 lines) is one module, no custom element:

- `mountDevTools(container, options)`: `mode` (`'dock'` default | `'inline'`), `hotkey` (default `` Ctrl+` ``, `''` disables),
  `tab` (initial), `open` (dock only, start open), `size` (`small`/`medium`/`large`, dock height via `SIZES` = `25vh`/`40vh`/`65vh`),
  `theme`, `panels` (extra tabs).
- A **panel** is exactly `{ id, title, mount(element, context) }`; `mount` returns nothing or `{ destroy(), activate(), deactivate() }`.
  `context` is `{ doc, win, theme, whileHidden(fn), isTool(el) }`. This is already the general shape the issue asks for — confirmed by
  reading `panels.js`, where `qualityPanel`/`inspectorPanel`/`themePanel`/`layoutBuilderPanel` are ordinary consumers of it, no different
  from a hypothetical app panel.
- Dock mode: builds a `pk-tabs` surface inside an `<aside>` appended to `doc.body` (not the passed `container`, which is ignored in dock
  mode — `mountDevTools(null, { mode: 'dock' })` is the documented call), plus a floating launcher `pk-button`. A `pk-button-group`
  (`sizes`) sets `--dt-height`; a `keydown` listener on `doc` matches the hotkey (`matchesHotkey`, exported, pure) and calls `toggle()`.
  All panels mount up front (console must record from page load); `activate()`/`deactivate()` follow which tab is visible and whether
  the dock is open, driven by one `sync()` closure.
- Inline mode: renders the same `pk-tabs` surface into `container`, no launcher, no hotkey, no `SIZES`/`sizes` button group, always "open".
- Returns `{ open(), close(), toggle(), isOpen(), select(id), tabs(), destroy() }`.
- CSS: `devtools.css`, loaded alongside `plainkit.css` via `ensureStyles`.

Every dock-specific concern (`SIZES`, the hotkey, the launcher button, `doc.body` mounting, `whileHidden`) and every generic concern
(the `pk-tabs` surface, panel mount/activate/deactivate lifecycle, `isTool`) currently live in the same 134-line file with no seam
between them beyond the `BUILT_IN` constant.

## Consumers found (backward-compatibility scope)

| Consumer | File | How it calls `mountDevTools` | Impact under the recommended approach |
| --- | --- | --- | --- |
| SDK site, docked dev tools on every page | `core/site/shell.js` and pages that mount the shell (confirm exact call site with `grep '../modules/devtools'` — the shell wires the dock globally; `core/site/devtools/page.js` is the inline instance below) | `mountDevTools(null, { mode: 'dock' })` (default options) | None. `mountDevTools`'s signature, options and returned handle are unchanged; it now builds its `panels` array from `BUILT_IN` and calls the new module internally. |
| SDK site, `/devtools` page | `core/site/devtools/page.js` | `mountDevTools(document.getElementById('devtools'), { mode: 'inline' })` | None, same reason. |
| Blazor `PkDevTools` component | `blazor/src/PlainKit.Blazor/Components/PkDevTools.razor` via the JS bridge (`blazor/src/PlainKit.Blazor/wwwroot/blazor-devtools.js`, `plainkit.blazor.js`'s `mountDevTools`/`openTools`/`closeTools`/`toggleTools`/`selectTool`/`destroy` bridge calls) | Calls the same `mountDevTools(container, { mode, hotkey, tab, open, size, theme })` signature by tag name through `InvokeVoidAsync` | None. The bridge calls the same exported function name with the same option keys; internal restructuring is invisible across the JS interop boundary. |
| `scripts/tests/blazor-devtools.test.mjs`, `blazor/tests/PlainKit.Blazor.Tests/ToolComponentTests.cs`, `SecurityTests.cs` | test suites | assert on `mountDevTools`'s behavior/API | Re-run as-is; a test that reaches into `devtools.js` internals (none found — all go through the public `mountDevTools`/bridge surface) would need updating, but no such test exists today. |
| `scripts/skills/plainkit-sdk/SKILL.md` | skill docs | documents `mountDevTools({ mode: 'dock' })` | Text describing `mountDevTools` stays correct; a new paragraph is added for `mountToolDock` (see "Docs and skills"). |
| `core/README.md`, `core/HANDOFF.md`, `CHANGELOG.md` | prose mentions | describe the dock feature | Updated to mention the new module exists underneath, not a behavior change. |

No consumer imports anything from `core/modules/devtools/` other than `mountDevTools` (and `panels.js`'s exports, used only inside
`devtools.js` itself). This means the extraction can move code freely inside `modules/devtools/` and `modules/tool-dock/` as long as
`mountDevTools`'s exported name, signature, options, and returned handle shape are preserved exactly — which is a **file-move-and-thin-
wrapper** change, not an API change, so every consumer above needs zero changes.

## Design

### Public shape of the new module

```js
// core/modules/tool-dock/tool-dock.js
export async function mountToolDock(container, options = {}) { ... }
```

Options, split from `mountDevTools`'s current options list into what is generic (moves here) and what stays devtools-specific:

| Option | Generic (moves to `mountToolDock`) | Notes |
| --- | --- | --- |
| `mode` (`'dock' \| 'inline'`) | yes | unchanged meaning |
| `hotkey` | yes | unchanged, `matchesHotkey` moves with it |
| `tab` | yes | unchanged |
| `open` | yes | unchanged |
| `size` (`small`/`medium`/`large`) | yes | `SIZES` map moves; devtools re-exports it for anyone depending on the current export (see "Compatibility exports" below) |
| `theme` | yes | unchanged |
| `panels` | yes — this becomes the **only** way panels are supplied; `mountToolDock` has no `BUILT_IN` of its own | `{ id, title, mount(el, context) }`, exact current shape, no change |
| `label` (new) | yes | accessible name for the `<aside>`/`<section>` (`aria-label`); `mountDevTools` passes `'Dev tools'` so its current `aria-label="Dev tools"` is unchanged |
| `launcherLabel` (new) | yes | text of the floating launcher button; `mountDevTools` passes `'Dev tools'`, matching current text exactly |

`mountDevTools`'s own options (`mode`, `hotkey`, `tab`, `open`, `size`, `theme`, `panels`) are unchanged in name and meaning; internally
it now does:

```js
export async function mountDevTools(container, options = {}) {
    const all = [...BUILT_IN, ...(options.panels ?? [])];
    return mountToolDock(container, { ...options, panels: all, label: 'Dev tools', launcherLabel: 'Dev tools' });
}
```

`devtools.js` shrinks to: the `import`s of its six panel-producing modules, `BUILT_IN`, this thin wrapper, and its own CSS
(`devtools.css` stays devtools-only — the launcher/tab-strip *shell* CSS moves to `tool-dock.css`, loaded by `mountToolDock`, and
`devtools.css` keeps only rules specific to the dev tools' own panels if any exist after checking; confirm during implementation with
`grep` over `devtools.css` for selectors that only make sense generically (`.dt-surface`, `.dt-launcher`, `.dt-panel-body`) versus
devtools-specific ones).

### Compatibility exports

`SIZES` and `matchesHotkey` are exported from `devtools.js` today (`export const SIZES`, `export function matchesHotkey`). No consumer
found imports them (checked with `grep -r "from.*devtools/devtools.js"` — only `mountDevTools` itself is imported anywhere). They are
moved to `tool-dock.js` and **not** re-exported from `devtools.js`, since nothing depends on the old export path; this is confirmed
correct rather than assumed, per the consumer table above, and is a one-line check to redo before implementation in case a branch in
flight added a new import.

### Naming

The module: `mountToolDock`, `core/modules/tool-dock/tool-dock.js`. Considered names:

| Name | Verdict |
| --- | --- |
| `pk-dock` / `PkDock` (issue's suggestion) | Rejected: already the custom element from #432 (shipped). Reusing it is confusing across the element list, Blazor component list, docs, skills, and (if this ever became a custom element) the tag registry. |
| `mountDock` (issue's suggestion, no `pk-` prefix since this is a module not an element) | Rejected: still visually and verbally collides with "dock" the element/concept in changelog entries, search, and conversation ("the dock" would be ambiguous between the two). |
| `mountPanelDock` | Considered. Reasonable, but "panel" is heavily used by `pk-dock`'s own vocabulary (`pk-dock-panel`, `dockPanel()` operation, `PkDockPanel`), which risks the same ambiguity one level down. |
| `mountToolDock` (recommended) | Names the thing it actually is — a dock *for tools/utility panels* around page content, the exact framing in the issue's "Why" section ("tool-type panels — properties, history, an outline, a console, a chat"). Reads unambiguously next to `pk-dock` in an index: "tool dock" vs. "dock" (workspace panes). Matches how `mountDevTools` already describes itself in its own header comment ("puts the SDK's live tools ... in one tabbed surface"). |

Folder: `core/modules/tool-dock/` (files `tool-dock.js`, `tool-dock.css`). Blazor component: `PkToolDock` (`PkToolDock.razor`), alongside
`PkDevTools.razor` and distinct from the existing `PkDock`/`PkDockPanel` for the `pk-dock` element. Skills and docs refer to it as "the
tool dock module" and always spell out `mountToolDock`/`PkToolDock` on first mention next to any mention of `pk-dock` to keep the two
apart in prose, not just in code.

### Element or module?

Recommendation: **stay a JS module, no custom element**, matching `mountDevTools` today and the explicit rule in `core/STANDARDS.md`
("Modules": *"A custom element wrapper is optional and only added when it is a thin layer over the module"*). Reasons specific to this
case:

- In `mode: 'dock'` the surface is appended directly to `doc.body`, not to the caller's `container` — it is a page-level overlay, like a
  toast host or the command palette, not a piece of content a consumer places in their DOM tree the way `<pk-dock>` sits where its
  author put it. A custom element's contract (host owns light DOM, element owns shadow tree, ownership rules in `core/STANDARDS.md`
  "Ownership and reactivity") does not fit something that relocates itself to `<body>` and listens for a page-wide hotkey.
  Custom-element `pk-dock` genuinely stays in place in the layout; this genuinely does not, in the dock mode that is most of its value.
- Panels are supplied as `{ id, title, mount(el, context) }` callbacks today, not as slotted light-DOM children — this is closer to how
  a module registers content ( `mountLayoutBuilder`, `mountQuality`, etc. all take callback/option-shaped input) than to `pk-dock-panel`'s
  declarative children. Converting panel supply to slotted markup would be a bigger, riskier change than the issue asks for and would
  make `mountDevTools`'s six built-in panels (three of which are themselves other modules' `mountX` calls) awkward to declare
  declaratively without inventing wrapper elements.
- Size budget: `pk-dock` is already a real element investment (~250 lines JS + 60 lines CSS per its own design doc, plus `dock-model.js`).
  A second custom element competing for the same "dock" mental model, budget line and gallery slot, when the underlying behavior is a
  much smaller single floating panel, is not proportionate. A module has no element-registry entry, no shadow DOM overhead, and is
  loaded only by the pages/apps that call `mountToolDock`.
- Precedent: every other `mountX(container, options)` tool in `core/modules/` (`console`, `logs`, `log-settings`, `performance`,
  `quality`, `theme-editor`, `layout-builder`) is a module with no element wrapper; `mountDevTools` is the module that already composes
  several of them. `mountToolDock` extending that family, rather than becoming the one dock-flavored module that is secretly a custom
  element, keeps the module layer consistent.

Alternative considered: a thin custom element wrapper (`<pk-tool-dock>`) over the module, the way `pk-gallery` wraps a module per
`STANDARDS.md`. Rejected for now because `pk-gallery`-style wrapping fits an element that stays in the DOM position its author put it;
`mountToolDock`'s dock mode explicitly does not. If a future consumer wants an inline, declaratively-placed tool dock badly enough to
justify an element, `mode: 'inline'` already covers "fills a container" without one — a wrapper element there would only save an
`await mountToolDock(el, {...})` call, which is not enough justification on its own (`STANDARDS.md`: *"only added when it is a thin
layer over the module"* — true today only in the sense that it would add nothing).

### Extraction mechanics (no behavior change)

1. Move the DOM-building, dock-state, hotkey, resize-button-group and lifecycle code (`mountDevTools`'s current body from `h(doc,
   'pk-tabs', ...)` through the returned `api`) into `tool-dock.js` as `mountToolDock`, renaming only the internal `dt-*` CSS class
   prefix to `td-*` (a rename, not a redesign — `devtools.css`'s selectors move to `tool-dock.css` under the new prefix) and the
   `'Dev tools'` accessible-name literals to the new `label`/`launcherLabel` options, defaulted from `mountDevTools`'s call site so the
   rendered `aria-label` and launcher text are byte-identical to today's.
2. `devtools.js` keeps `BUILT_IN`, its imports of the six panel modules, and the three-line wrapper above.
3. `panels.js` is untouched — it already returns the generic panel shape and never imported anything dock-specific.
4. CSS custom properties: `--dt-height` becomes `--td-height` (only referenced within `tool-dock.css`/`tool-dock.js`, confirmed by
   `grep -r '\-\-dt-height'`); no public `--pk-devtools-*` token existed for it (check `devtools.css`'s documented hooks in its
   `.meta.json`-equivalent, if any, before finalizing — `modules/` tools do not have `.meta.json`, so there is no public-hook contract
   to preserve here beyond what `devtools.css`'s comments document).
5. Node tests: any existing test importing from `core/modules/devtools/devtools.js` (check `core/modules/devtools/*.test.mjs` if
   present, or `core/tests/`) is re-pointed at whichever module now owns the tested behavior (`matchesHotkey` → `tool-dock.test.mjs`;
   `mountDevTools`'s own options/behavior stays tested against `devtools.js`, now via the thin wrapper). A parallel `tool-dock.test.mjs`
   is added covering `mountToolDock` directly (mode inline/dock, hotkey toggle, size buttons, panel activate/deactivate, `whileHidden`),
   so the generic behavior has direct coverage instead of only being exercised indirectly through `mountDevTools`.

### Blazor: `PkToolDock`

Following how `PkDevTools`/`PkDevToolsHost` are built today (hand-written component + hand-written JS bridge file
`blazor-devtools.js`, **not** the generated `blazor/mappings/<name>.json` pipeline — that pipeline is for `core/elements/**` custom
elements per `core/STANDARDS.md` "Names", and `mountToolDock`/`mountDevTools` are modules, not elements, so there is no
`mappings/tool-dock.json` to write):

- `blazor/src/PlainKit.Blazor/Components/PkToolDock.razor`: same parameter shape as `PkDevTools.razor` minus the devtools-specific
  `BlazorPanels` parameter — `Mode`, `Tab`, `Open`, `Hotkey`, `Size`, `Theme`, `Label`, `LauncherLabel`, and a way to supply panels. Panel
  content in Blazor cannot be a JS `mount(el, context)` callback the way the vanilla module takes it (Blazor owns rendering through
  `RenderFragment`s, not raw DOM callbacks) — so `PkToolDock` takes `RenderFragment`-based child content
  (`<PkToolDockPanel Id="..." Title="...">...razor markup...</PkToolDockPanel>`) and the component's own JS bridge (`tool-dock.js`'s
  Blazor half, `wwwroot/tool-dock-bridge.js`, mirroring `blazor-devtools.js`'s pattern) mounts each panel's DOM node with a `mount` that
  just reveals/hides a pre-rendered `<div>` Blazor already rendered into, the same trick `PkDevTools`'s single `_host` div/`hidden`
  attribute already uses for the inline case (`PkDevTools.razor` line 11). This is a real design decision with more surface than the
  rest of this doc — flagged as open question 4, since it is the one place Blazor genuinely cannot mirror the vanilla `panels` option
  1:1 and needs its own small design pass, likely a short follow-on note before implementation.
- `PkDevToolsHost.cs`-equivalent: not needed for `PkToolDock` itself (that class is devtools' Blazor/Components tab data, which stays
  devtools-only); `PkDevTools.razor` keeps using it.
- `PkDevTools.razor` internally could eventually mount `PkToolDock` plus its own `PkDevToolsHost`-driven panels, mirroring the vanilla
  `mountDevTools` → `mountToolDock` relationship, but that is optional polish, not required for consumers (the JS bridge already calls
  through `mountDevTools`'s unchanged signature, so `PkDevTools.razor` needs no change at all in the minimal version of this work).

## Approaches considered

**A. Extract in place, thin wrapper (recommended).** As described above: move the generic body to `tool-dock.js`, `devtools.js`
becomes `BUILT_IN` + a 3-line wrapper calling `mountToolDock`. Lowest risk (mechanical move, `mountDevTools`'s signature untouched),
smallest diff, matches "about 400 hand-written lines" per-PR guidance easily (this is mostly a file move). Trade-off: `mountToolDock`
inherits some devtools-flavored defaults (`launcherLabel` etc. must be explicitly passed by `mountDevTools`, or the new module would
need sensible generic defaults of its own that differ from devtools' current literal text — handled above by making `mountDevTools`
pass `label`/`launcherLabel` explicitly rather than relying on a shared default).

**B. New module from scratch, `mountDevTools` migrates later.** Write `mountToolDock` independently (not extracted from
`devtools.js`), ship it, then in a *separate* follow-up issue switch `mountDevTools` to consume it. Trade-off: two implementations of
the same floating/hotkey/resize logic exist simultaneously for at least one release, actively risking the divergence the issue's own
"Why" section (`mountDevTools` becomes a thin consumer "so the two never drift") is trying to prevent. Only worth it if the extraction
in Approach A turns out to be riskier than it looks once implementation starts (for example, if `devtools.css` turns out to have
subtle devtools-specific rules tangled into the generic selectors that make a clean split harder than the file-read above suggests).
Not recommended as the first move, but the fallback if A stalls mid-implementation.

**C. Keep `mountDevTools` as-is, add `mountToolDock` as a fully separate, non-extracted module that happens to duplicate the pattern.**
Fastest to ship, zero regression risk to `mountDevTools` (nothing about it changes). Rejected: this is explicitly what the issue asks
*not* to do ("so the two never drift") — it leaves exactly the maintenance hazard (two copies of hotkey/resize/dock logic) the whole
request exists to remove, and does not resolve the issue.

**Recommendation: Approach A.** It satisfies the issue's explicit request ("`mountDevTools` becomes a thin consumer of it... so the two
never drift"), is a mechanical, low-risk extraction with a clear compatibility table above, and keeps the change small enough for one
implementation PR around the module + tests, with the Blazor wrapper (open question 4's scope) as a natural second PR.

## Docs and skills

Per AGENTS.md ("agent skills and documentation" is part of done): `scripts/skills/plainkit-sdk/SKILL.md`'s workflow text describing
`mountDevTools({ mode: 'dock' })` gets a new paragraph for `mountToolDock`, cross-referencing `pk-dock` by name with one sentence
distinguishing them ("a single floating/docked tool panel, not the multi-pane `pk-dock` workspace element"). `core/site` gets a gallery
sample or a dedicated `/tool-dock` page demonstrating `mountToolDock` with app-supplied panels, independent of dev tools (mirroring how
`/devtools` demonstrates `mountDevTools` inline today) — this is the "consumer app can point it at its own content" proof the issue
asks for, and doubles as the module's own UI-review surface if its CSS changes in a later PR.

## Risks

- **CSS split risk.** `devtools.css` may have rules that look generic but were only ever exercised by devtools' own panels (for
  example a selector scoped to `.dt-panel-body pk-table`). The extraction must be verified by actually running `mountDevTools` in both
  modes after the split (`node scripts/attest-browser.mjs` or a manual `core/site/devtools/page.js` load) before merging, not assumed
  correct from reading the CSS alone.
- **Accessible-name drift.** If `label`/`launcherLabel` defaults inside `mountToolDock` differ even slightly from the literal `'Dev
  tools'` text `mountDevTools` passes today, `aria-label` and the launcher button's text change for existing users — a real
  regression even though it is "just strings". Covered by an explicit node test asserting the rendered `aria-label` and button text
  after `mountDevTools()` are unchanged.
- **Test coverage gap today.** No dedicated `devtools.test.mjs`/`tool-dock.test.mjs` was found during this design pass (confirm with
  `ls core/modules/devtools/*.test.mjs` at implementation time) — if none exists, the extraction PR must add one covering both
  `mountToolDock` directly and `mountDevTools`'s thin-wrapper behavior, per "verification-before-completion", not rely on the site
  loading successfully as the only signal.
- **This spec is scoped to fit one implementation PR** (module + wrapper + node tests + docs/skills + changelog fragment; the Blazor
  `PkToolDock` piece is naturally a second PR given open question 4's unresolved `RenderFragment`-vs-callback design point). If the
  owner wants both in one PR, split as: PR 1 = `tool-dock.js` extraction + `mountDevTools` thin wrapper + tests + vanilla docs/skills
  (this is releasable alone: `mountDevTools` consumers see zero change); PR 2 = `PkToolDock`/`PkToolDockPanel` Blazor wrapper + its
  bridge JS + Blazor docs/mappings-equivalent + changelog fragment, once open question 4 is settled. Each leaves `main` releasable per
  AGENTS.md's splitting rule.

## Open questions for the owner

1. **`launcherLabel`/`label` defaults.** Confirmed plan is `mountDevTools` passes `'Dev tools'` explicitly for both so nothing changes
   for existing consumers — does `mountToolDock` need a sensible default of its own (e.g. `'Tools'`) for a consumer that supplies
   neither, or should both be required options with no default (fail loud via the existing logger convention if omitted)?
2. **`devtools.css` split.** Confirm at implementation time (not assumed here) exactly which selectors are generic-shell vs.
   devtools-panel-specific; if the split is messy, Approach B (new module first, migrate `mountDevTools` in a follow-up) becomes the
   safer path for that one PR.
3. **Placement beyond `bottom`.** The issue text mentions `left`/`right` placement as part of the ask ("Placement (`bottom`/`right`/
   `left`)... same knobs `mountDevTools` already has"), but `mountDevTools` today only implements `bottom` (no `placement` option
   exists in the current code at all — this is a request to *add* new behavior while extracting, not just lift existing behavior).
   Recommend treating `left`/`right` placement as a follow-up issue once the extraction itself ships, so this PR stays a pure
   lift-and-thin-wrapper with zero new behavior to verify; flag this explicitly to the owner since the issue text could be read either
   way.
4. **Blazor panel-supply shape.** `RenderFragment`-based `PkToolDockPanel` children (proposed above) vs. some other shape — this needs
   its own short design pass before PR 2 is planned; is that pass wanted as part of this same spec (expanded), or as a follow-up spec
   once PR 1 (the vanilla extraction) has shipped and the Blazor team can react to the real `mountToolDock` API instead of this
   proposal?
5. **Gallery/demo page.** Is a dedicated `/tool-dock` site page in scope for PR 1, or does the extraction ship first with only the
   existing `/devtools` page as a (indirect) demonstration, and the standalone demo follows once a real second consumer exists?
