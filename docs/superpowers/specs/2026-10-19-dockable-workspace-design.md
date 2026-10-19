# Dockable workspace: finishing `pk-dock`, and the decisions around it (refs #432, #590, #593, #598)

Status: requirements and design for owner review. Docs only; no product code, no budget change. Refs #432 (does not close it); standing tracker #336.
Owner direction on #432 (2026-10-19): higher priority than pk-os (#598). Related: #590 (panel declaration API), #593 (pk-workspace vs pk-dock), #591 (shortcuts registry), #598 (pk-os), #430, #431.

This **updates** `2026-09-28-dockable-layout-design.md`, which proposed `pk-dock` before it existed. Most of it has since shipped, in a slightly different shape (panels are any slotted element with `data-*` hints; no `pk-dock-panel` yet).
This document records what exists, what remains, the three open decisions (#590, #593, and the pk-os seam from #598) with recommendations, and a phased plan for the rest.

## 1. Goal and non-goals

Goal: a desktop-style dockable workspace (Toolbox | Canvas | Properties) that a tool or an app can rely on: resizable splits, tab groups, panels that move by pointer **and** by menu/keyboard, collapse to header or rail, floating panels, close and reopen, a persisted layout, and a sensible phone fallback. The remaining work is the last 20 percent plus decisions; the cost control is that every new capability lives in a lazy `dock-*` module because `dock.js` is at 3.94 KB of its 4 KB gzip limit.

Non-goals:

- No multi-window or browser pop-out; "floating" means inside the dock's own bounds (decided, shipped).
- No window manager: no snapping between floaters, no taskbar, no tiling. (A pk-os skin builds those on top, section 9.)
- No layout builder dependency in the model; no cross-device layout sync; named layout presets stay an app concern (Q7).
- No second pane primitive: `pk-splitter` (binary) and `pk-tabs` are reused as they are.
- No change to what `pk-workspace` is (the fixed nav/main/aside page).

## 2. Users and use cases

| User | Need | Served by |
| --- | --- | --- |
| Builder of an editor/IDE-style tool (layout builder, SVG editor, log viewer) | Toolbox, canvas, properties; user rearranges; layout survives reload | `pk-dock` (exists) |
| Keyboard-only or screen-reader user | move, resize, collapse, close, reopen panels without a mouse | Move menu, splitter keys, floater keys (exist); chords (phase D3) |
| Phone user | a usable fallback, not a squashed splitter tree | one tab strip (exists), polish in D5 |
| App author with a fixed content page | nav + main + aside, no rearranging | `pk-workspace` (#593 keeps it) |
| pk-os author | windows with position/size/z-order, minimize/maximize | the floating layer plus a small model extension (section 9) |
| Agent | one documented way to declare panels | slot + `data-*` (#590 decision) |

## 3. What exists today (verified on main, 2026-10-19)

- **Model, pure and node-tested** (`core/js/dock-model.js` plus `dock-tree.js`, `dock-json.js`, `dock-float.js`, `dock-flyout.js`, `dock-drag.js`, `dock-render.js`; 0.9 to 2 KB gzip each, about 12 KB across lazy modules): split and tab-group nodes, `resize`, `activate`, `moveTab`, `dockPanel`, `collapsePanel`/`expandPanel`, validated `toJson`/`fromJson` (declared panels repaired, hostile input safe), floater ops (`floatPanel`, `dockFloating`, `moveFloater`, `resizeFloater`, `raiseFloater`).
- **`pk-dock`** (`core/components/dock/`, tier `component`, 3.94 KB gzip): panels are slotted elements with `slot="<id>"`, `data-heading`, `data-group`; `pk-splitter` separators (pointer, arrows); `pk-tabs` groups; **Move menu** per group (add as tab, dock left/right/above/below); **drag-to-dock** (zones: centre adds a tab, edges split); close and reopen via the toolbar's **Panels** menu; `toolbar-start` slot for a host's menus; header-collapse for a single-panel group; **collapse-to-rail with flyout** (rail button, Escape/outside-click close, Expand button, #636); **floating panels** (float from the Panel menu, drag header, resize grip, arrow-key move and Alt+Arrow resize, raise on focus, dock back from the menu, kept inside the dock's bounds); **`persist-key`** through the SDK store; `confirmLayout` callback property for round-trip control; live region announcements; phone: one scrollable tab strip, layout untouched. Event `pk-layout-change { layout, reason }`. Public methods: **none** (`methods: []` in the meta).
- `pk-workspace` (`core/elements/workspace`, tier element, 2.28 KB): fixed `nav`/`main`/`aside` page with a phone strip. The guide row "workspace or dock" shipped (#593 step 1).
- Consumers: the layout builder moved onto `pk-dock` (PR #603); `core/modules/tool-dock` and `audit-dashboard` also use it. Blazor `PkDock` exists (empty and toolbar-start slots, #1409/#1410).
- Reusable: `js/history.js` (undo stack with coalescing), `js/shortcuts.js` (`registerChord`, #591), `js/store.js`, `js/breakpoints.js`.
- Not present: undo/redo, `resetLayout`, a protected **`center`** panel, per-panel options (closable, icon, default size, collapsible), public methods, pointer drag **to float** and of a floater **onto** dock zones, tab-group collapse, keyboard chords for reorder/float, the registry wiring, a `minimized`/maximized floater state, `workspace` page-type opt-in, a Blazor `PkDockPanel`.

## 4. Decisions the issues ask for

### 4.1 #590: panel declaration API (slotted vs factory)

Recommendation, consistent with the research on the issue: **slotted children are the stable, supported API; no factory callback.** A slotted node keeps form state, scroll and focus across every dock move (the host owns light DOM; the dock only slots it), is declarative and auditable in markup, and is a thin Blazor wrapper (a callback is a JS-interop problem).
If upfront instantiation is ever a measured problem, add an opt-in `lazy` declaration whose content is an inert `<template>` stamped on first show (event `pk-dock-panel-shown`), never a callback. Not built now. The per-panel options (closable, collapsible, icon, default size, open, float) are read from `data-*` attributes on the slotted node (phase D1), which needs **no new element**.
A `pk-dock-panel` element is therefore optional: it would only be a nicer spelling, and it has a structural cost (the slotted node needs a `slot` attribute that the element would have to write onto its own host, which breaks "host owns attributes"; the alternative, manual slot assignment, is a bigger change). Recommend: not built; revisit only when Blazor or the audit tooling proves `data-*` insufficient.

### 4.2 #593: pk-workspace vs pk-dock

Recommendation: **keep both** (tiers: workspace is `element`, dock is `component`; merging would push a static content page up a tier and cost). Decision criteria go on the issue and are mechanical: (1) gzip of a static page using a `fixed` dock vs `pk-workspace`: keep both if dock is more than about 2x; (2) shared phone-strip logic: if most of it can move to one js module, share code and keep two tags; (3) real consumers: how many pages use workspace; did any ask for resize/tabs; (4) Blazor wrappers: thin either way.
Revisit after phases D1 to D4 (the dock's open steps). Today the dock alone is 3.94 KB and workspace 2.28 KB, so a preset is not free. Smallest next step: one measuring script/test-less note on the issue (criteria 1 and 2 numbers), no code.

### 4.3 #598: the pk-os seam (summary; detail in section 9)

pk-os is a separate package under `apps/`, lowest priority of the four. The dock's job is to expose a small, general window-like API and nothing pk-os-specific: public methods, a `minimized`/maximized floater state, and styling hooks. All of it is useful without pk-os.

## 5. Proposal for the remaining work

### 5.1 Elements and tiers

No new public element. `pk-dock` stays tier `component` (it renders `pk-splitter`, `pk-tabs`, `pk-button`, `pk-dropdown`, `pk-menu-item`; all element or component tier, so C1/C4 hold). New behaviour goes into lazy modules (`dock-*.js`, each under the 6 KB module limit); `dock.js` only gains import lines. Phase D0 buys headroom first.

### 5.2 Public API (additions only; existing names and behaviour unchanged)

- **Attributes on a slotted panel node** (read by the dock, never written): `data-closable="false"`, `data-collapsible="false"`, `data-icon="<icon name>"` (used by rails and the phone strip), `data-default-size="<percent>"`, `data-open="false"` (start closed), `data-float` (start floating), and `data-group="center"` made meaningful (below).
- **`center` panel**: the panel in `data-group="center"` is the permanent centre: it cannot be closed or floated, `resetLayout()` and the phone strip start on it, and the model keeps one tab group for it (invariant added to `validate`). This is the "center flag" follow-up from #432 and fixes the phone strip opening on the Palette in the layout builder.
- **Props**: `undo` (boolean, opt in to `Ctrl+Z`/`Ctrl+Shift+Z` handling while focus is inside), `floating` (boolean, default true; false removes Float items), `drag-dock` (boolean, default true; the menu path is always on).
- **Methods** (thin calls into the model, raising the same `pk-layout-change` reasons): `getLayout()`, `setLayout(json)` (returns problems), `resetLayout()`, `openPanel(id)`, `closePanel(id)`, `floatPanel(id, rect?)`, `dockPanel(id, { target, zone })`, `collapsePanel(id)`, `raisePanel(id)`, `undo()`, `redo()`. These are needed for pk-os, for tests, for Blazor `controlled` mode and for hosts that add their own menu items.
- **Events**: `pk-layout-change` gains reasons `reset`, `undo`, `redo`, `open`, `close` (close/open currently ride `panels`/`move`; confirm in D1 and keep old reasons stable). Cancelable `pk-panel-close { panel }` (a consumer can veto an unsaved panel) and `pk-panel-active { group, panel }` if the existing event is insufficient. No existing event name changes.
- **Parts/CSS hooks**: existing `toolbar root group header collapse-toggle title body rail-button flyout empty status` and `--pk-dock-height --pk-dock-header-height --pk-dock-pad --pk-dock-rail-width --pk-dock-flyout-width`; add `floater-header` and `floater-resize` parts and `--pk-dock-floater-shadow` (defaults to a `--shadow-*` token) so a skin (pk-os, or any theme) can restyle windows without new code. Tokens only.

### 5.3 Model changes

`resetLayout(doc, defaults)`, `center` invariant, `history` integration (the dock keeps a `history.js` stack of layout documents; resize and floater moves use the coalescing key so a drag is one undo step), `closePanel`/`openPanel` as first-class ops (remember the last neighbour for `openPanel`) if not already folded into `fromJson` repair, and later `minimized` (section 9). Every op stays total (unknown ids return the input plus a `problem`), every invariant is property-tested, `fromJson` stays the one door for stored data. Depth and node limits (`LIMITS`) cover the new fields.

## 6. Keyboard and accessibility

Already true: separators are `role="separator"` with `aria-valuenow/min/max` and arrow/Home/End keys (RTL mirrored); tab groups are `pk-tabs` tablists; single panels are labelled regions; collapse and rail buttons are real buttons with `aria-expanded`; hidden panels are out of the tab order and tree; flyout Escape returns focus to the rail button; a floater is a focusable group with arrow-key move and Alt+Arrow resize; the Move menu gives a non-drag path for every dock action (WCAG 2.5.7); a polite live region announces moves, close/reopen and floater changes.
Added by this plan:

| Key | When | Action (phase D3, via `registerChord` so the app can remap, #591) |
| --- | --- | --- |
| `Alt+Shift+Left/Right` | on a focused tab | reorder within the group |
| `Alt+Shift+Up/Down` | on a focused tab/header | move the panel as a tab to the neighbouring group; the target is announced |
| `Ctrl+Alt+F` | on a panel or tab | float / dock back |
| `Delete` or `Ctrl+W` | on a closable tab | close (cancelable `pk-panel-close`) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | focus inside, `undo` set | undo / redo a layout change |

Chords are registered while a dock is connected and unregistered on `disconnected()` (ownership rules); they never take Tab or the arrows alone. Focus after a structural change goes to the moved panel's tab, after close to the neighbouring tab, else the Panels button. Reduced motion: no animation on dock, float or collapse. Forced colours: drop zones and focus rings are outlines. The scorecard quality run stays at zero errors; contrast, names and tap targets stay covered by the UI review.

## 7. Touch and phone

Shipped: below 640 px the docked tree flattens to one scrollable tab strip, one panel visible; the layout document is untouched (a rotation or resize loses nothing); 44 px tap targets. Plan: D1 makes the `center` panel the initial tab; D5 fixes the two known defects (#602: a narrow group's panel menu wrapping under its tabs, the strip wrapping to two rows), shows floaters as the last tabs, hides Float and dock-direction items on phone, and offers `Close`/`Collapse` only. Touch drag-to-dock stays off on phone (the menu is the only path, which is why it is mandatory). A `phone="drawers"` mode (side groups as `pk-drawer`) is **not** planned; add only if asked (Q3).

## 8. Performance and size

- Model ops are pure and O(nodes) with structural sharing; a resize drag touches `pk-splitter` custom properties and commits once on release; floater moves set `transform` and commit on release; drop-zone hit testing uses rects cached at drag start.
- `ResizeObserver` on the dock box only, disconnected in `disconnected()`; one `pointermove` handler per drag session.
- Budgets (never raised): element limit 4 KB (`dock.js` 3.94 now), JS module limit 6 KB each (largest dock module 1.96). Because `dock.js` has about 60 bytes of headroom, **phase D0 moves existing code out before anything is added** (candidate: the Move menu and Panels menu builders into a lazy `dock-menu.js`, keeping behaviour identical), so later phases have room. Each phase reports measured gzip for `dock.js` and the new module in the PR. A node test asserts `dock.js` imports no layer statically except those it needs on first paint.
- Persistence writes are debounced and flushed on `pagehide` (exists through the store).

## 9. What pk-os (#598) would need, and what stays out of core

pk-os is a full-viewport `pk-dock` used with every panel floating, plus apps as `defineModule` modules. What it needs from #432, all general and none pk-os-named:

| Need | Core addition (general) | Phase |
| --- | --- | --- |
| open/close/raise a window from code | public methods (5.2) | D2 |
| position, size, z-order, drag, resize | already shipped (floating layer) | done |
| tabbed windows | already shipped (a floater holds a tab group) | done |
| minimize (hide without closing) and maximize (fill the dock, remember the old rect) | `minimized` array and a `maximized` map in the model, ops `minimizeFloater`/`restoreFloater`/`maximizeFloater`, reasons `minimize|restore|maximize`, a `data-minimized` marker on the floater part; about 1 KB, in `dock-float.js` | D7, only when pk-os is scheduled |
| window chrome look (traffic lights left vs controls right) | `floater-header`/`floater-resize` parts and tokens (5.2); the chrome buttons are pk-os's slot content | D2 |
| taskbar, launcher, wallpaper, app lifecycle, skins | **pk-os package only**, composing `pk-tabs`-like strips; not in core | never in core |
| cycle-windows shortcut | `registerChord` (exists) | pk-os |

Rule: nothing in `pk-dock` mentions pk-os; a general capability (minimize) goes into the model with tests; a pk-os-only capability stays in `apps/pk-os`. If minimize/maximize pushes `dock-float.js` over budget it moves to its own lazy module. The pk-os spec should read the phase D7 note once it exists.

## 10. Blazor mapping notes (thin 1:1 wrapper)

`PkDock` exists from `blazor/mappings/dock.json`. Each phase adds mapping entries only (`"extra": true` for new parameters/events so hand-written files do not grow, `blazor/handwritten.baseline.json` never raised): `Undo`, `Floating`, `DragDock`, event `OnPanelClose`, methods as interop (`ResetLayoutAsync`, `OpenPanelAsync`, ...). `Layout` crosses as a JSON string validated by the same JS `fromJson`. `controlled` mode (host owns the layout) only when a Blazor Server scenario needs it (Q8). Panels are `ChildContent` with `slot`/`data-*` attributes, so `PkDockPanel`, if wanted, is a mapping-level convenience that renders those attributes, not a second element. No timers, retry loops or layout recipes in hand-written components (`blazor-wrapper.test.mjs`).

## 11. Testing plan

Node (`dock-model.test.mjs` family): invariants after every op including a seeded random sequence; the `center` invariant; `resetLayout`; `fromJson` with hostile, truncated, oversized, old/new version, added/removed panels; history coalescing (one drag = one undo step); key-table and chord-registration tests (registered on connect, gone on disconnect); import-graph test for `dock.js`; minimize/maximize ops when built.
Browser cases (`cases-dock.js`, written before the CSS): three columns side by side summing to the dock width within 1 px; a docked move keeps a slotted input's value and scroll offset; a collapsed rail is `--pk-dock-rail-width`; a floater stays inside the dock after the dock shrinks; `data-closable="false"` removes Close; the `center` panel cannot be closed or floated and is the initial phone tab; undo after drag-dock restores the previous arrangement in one step; phone shows one visible panel, one strip row, no horizontal overflow (#602 regression).
Scenarios (`core/tests/review/scenarios/`): existing dock scenarios extended with `dock-undo-reset`, `dock-drag-to-float` (zones, then outside-zone float), `dock-floater-redock`, `dock-keyboard-chords`, `dock-center-phone`, `dock-rtl`, `dock-rail-flyout`, each at desktop and phone, light and dark; every screenshot opened with the Read tool. The Blazor browser harness gets a lab case per new method.

## 12. Phased delivery

Each phase is one issue, one branch, one PR of about 400 hand-written lines or fewer, leaves `main` releasable, and carries docs, gallery sample, skills text, Blazor mapping and a changelog fragment. One agent PR open at a time.

| # | Phase | Depends on | Notes |
| --- | --- | --- | --- |
| D0 | **Headroom**: move the menu builders out of `dock.js` into a lazy module, no behaviour change; add the import-graph test | none | net size win for `dock.js`; unblocks everything |
| D1 | **Declaration and `center`**: `data-closable/collapsible/icon/default-size/open/float` readers (lazy `dock-decl.js`), `center` invariant, `resetLayout()` (model + method), initial phone tab = centre | D0 | fixes the layout-builder "opens on Palette" gap |
| D2 | **Public methods and parts**: the methods in 5.2, `floater-header`/`floater-resize` parts, `--pk-dock-floater-shadow`, cancelable `pk-panel-close`, Blazor interop | D1 | prerequisite for pk-os, Blazor controlled mode and tests |
| D3 | **Undo/redo and chords**: `history.js` stack with coalescing, `undo` prop, Reset in the Panels menu, chords via `registerChord` (#591) | D2 | |
| D4 | **Drag to float and re-dock**: drag a docked header outside all zones to float at the pointer; drag a floater onto zones to dock it; Escape cancels; scenarios | D0 | the last big missing pointer interaction |
| D5 | **Phone polish**: #602 fixes, floaters as trailing tabs, phone menu items; optional decision on `drawers` | D1 | |
| D6 | **Page-type opt-in and guide**: `workspace` page type accepts `config.dock`, guide "Build a dockable workspace", criteria measurements posted on #593 | D1, D3 | the framework path |
| D7 | **Window state for pk-os**: `minimized`/`maximized`, ops, reasons, marker, tests | D2, D4 | scheduled only when pk-os is scheduled |
| D8 | Optional, evidence-gated: `lazy` panel via `<template>` (#590), shared phone-strip module (#593), `phone="drawers"`, tab-group collapse | D1 | each only on a stated need |

D4 and D3 are independent after D2; D5 and D6 can run any time after D1. The SVG editor (S8) needs D1 (`center`) and D2; the canvas needs nothing from the dock.

## 13. Risks

- `dock.js` budget: mitigated by D0 first and lazy modules; no PR may raise the limit.
- Chord conflicts with browser or assistive-tech shortcuts: chords are registered through the registry so the app can remap or disable them, and are covered by a keyboard scenario; none uses Tab or bare arrows.
- Undo scope creep (does closing a panel undo?): decide that every `pk-layout-change` reason except `activate` is undoable; `activate` and floater `raise` are not (a tab click should not fill the stack).
- Floater state vs phone: floaters do not exist on phone; the layout document keeps them, and rendering them as tabs is read-only (no writes from a phone render).
- Drag complexity (D4) is the most bug-prone; the menu path already provides the accessible equivalent, and zone geometry is pure and node-tested.
- Two layout engines (`pk-workspace`, `pk-dock`) drift: the #593 criteria are measured once D1 to D4 land.

## 14. Open questions for the owner (recommended answer first)

1. **Declare panels how (#590)?** Recommend slotted children with `data-*` options as the stable API; no factory callback; no `pk-dock-panel` element until a concrete need; `lazy` via `<template>` only on evidence. Close #590 with this recorded.
2. **Keep `pk-workspace` (#593)?** Recommend keep both; post the four measured criteria after D4; a `fixed` dock preset only if the dock is under 2x the workspace cost.
3. **Phone `drawers` mode?** Recommend no; tabs only (shipped).
4. **Public methods in D2?** Recommend yes; `methods: []` is a gap for pk-os, tests and Blazor.
5. **Keyboard chords and the registry?** Recommend `registerChord` from the start of D3 (#591), so apps can remap; the exact chords in section 6.
6. **Undo scope?** Recommend all structural reasons except `activate` and `raise`; opt in with the `undo` prop.
7. **Named layouts/presets?** Recommend app concern (several layouts plus `setLayout`); nothing in the dock beyond `resetLayout`.
8. **Blazor `controlled` mode?** Recommend on demand, after D2 gives the methods it needs.
9. **Floating layer bounds?** Recommend inside the dock only (shipped); a full-viewport dock serves pk-os.
10. **pk-os seam (#598)?** Recommend only general additions (methods, parts, `minimized`/`maximized` in D7); nothing named after pk-os; D7 not scheduled before pk-os is.
11. **First dogfood after the layout builder?** Recommend the SVG editor (S8) as the second consumer, which also exercises `center`, methods and the canvas-in-dock scenario.
12. **Budget relief (D0)?** Recommend approving the move-out of the menu builders into a lazy module as the first PR, since `dock.js` is within 60 bytes of its limit; no limit is changed.
