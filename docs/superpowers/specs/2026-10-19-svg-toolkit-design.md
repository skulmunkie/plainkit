# SVG toolkit: a pure vector document, safe import/export, a safe viewer, then an editor (refs #431)

Status: requirements and design for owner review. Docs only; no product code, no budget change. Refs #431 (does not close it); standing tracker #336.
Owner direction on #431 (2026-10-19): higher priority than pk-os (#598). Related: #430 (canvas), #432 (dockable workspace), #429 (property grid, shipped).

This **updates** `2026-09-28-svg-toolkit-design.md`. Nothing of the toolkit has been built, but several of that spec's assumptions have since become facts on `main` (the shared history module, `pk-canvas`, `pk-dock`,
`pk-property-grid`, `pk-unit-input`, the module budgets). The model, the allow-list idea and the open boolean-ops question carry over; the element plan is slimmer. See "What changed since 09-28".

## 1. Goal and non-goals

Goal: first-class SVG for fabrication, print, signage, laser and maker work: create shapes, group, transform, align, edit paths, export a **safe, deterministic, unit-explicit** SVG string, and show user-supplied SVG without ever
executing it. Delivered in the SDK's usual shape: a pure, node-tested model; a sanitising importer and exporter driven by one allow-list; a tiny read-only element; and only then an editor composed from existing elements.

Non-goals:

- Not a graphics engine or raster editor: no filters, blend modes, masks, clipping, gradients editor, animation, images or `use` in the first releases (a "later" list at the end).
- Not a full SVG implementation: a strict, allow-listed subset. Import drops the rest and reports it; it does not render arbitrary files.
- No pan/zoom/grid/snap surface: that is `pk-canvas` (#430). No docking: that is `pk-dock` (#432).
- No DXF/PDF export, no PNG in the first editor (Q5).
- No runtime dependency in core. Boolean and offset operations are the one contested area (section 7).
- No pk-os features (section 10).

## 2. Users and use cases

| User | Need | Served by |
| --- | --- | --- |
| Any app showing user or third-party SVG (logos, avatars, uploads) | display it without XSS | `fromSvg` + `pk-svg-view` (first release) |
| Maker, sign shop, laser or print workflow | place shapes in mm, align, group, export a clean file | editor + `toSvg` in mm |
| Developer of a diagram or layout tool | generate shapes, compute bounds, hit-test | the pure modules, no UI |
| Server-side consumer (Blazor) | validate stored SVG | the allow-list published as data (`svg-allowlist.json`) |
| Keyboard and screen-reader user | create and edit shapes without a pointer | section 6 |
| Agent | a safe recipe: "never `innerHTML` user SVG" | skills workflow |

## 3. What exists today (verified on main, 2026-10-19)

- No SVG model, importer, exporter or editor. `core/elements/chart/chart.js` and `stat` build SVG with `createElementNS` and `textContent` only (the safe rendering pattern; `security.allow.json` needs no entry). `core/icons/build.mjs` lints bare `<svg viewBox="0 0 24 24">` icon sources by regex.
- Reusable now: `core/js/history.js` (a pure undo stack with key coalescing, already used by `theme-history-logic.js`; the SVG model uses it as is. The layout model keeps its own `createHistory` in `layout-ops.js`, left untouched: the 09-28 extraction step is **dropped**, not needed), `core/js/dock-tree.js` and `layout-tree.js` (tree helpers), `core/js/safe-url.js` (for a later `image`/`href` step), `core/js/sanitized-html.js` (build-time-sanitised markup only; not for user input), `core/js/zip-store.js` and the `createObjectURL` download idiom, `core/js/store.js`.
- Composable elements: `pk-canvas` (2.82 KB gzip; view, grid, pick, key, `pointToWorld`), `pk-dock` (3.94 KB of 4; docking, floating, persistence), `pk-property-grid` (#429), `pk-unit-input`, `pk-colour-input`, `pk-tree`, `pk-sortable`, `pk-toolbar`, `pk-code-view` (read-only source view with copy), `pk-dropdown`, `pk-menu-item`, `pk-context-menu`.
- The layout builder (`core/modules/layout-builder`, `js/layout-model.js`, `layout-builder-logic.js`) is the precedent for pure model + thin logic + UI, `problems` lists, `LIMITS`, hostile-input guarantees.
- Budgets: element 4 KB gzip, JS module 6 KB gzip, page layer 10 KB, app entry 22 KB hard cap. All one-way ratchets.

## 4. What changed since 09-28

| 09-28 assumption | Now | Effect |
| --- | --- | --- |
| "Extract `createHistory` from the layout model in step 1" | `js/history.js` already exists as a standalone stack | step dropped; layout builder untouched (answers Q7) |
| canvas contract unknown | `pk-canvas` ships `pk-view-change`, `pk-canvas-pick`, `pk-canvas-key`, `pointToWorld`; canvas spec adds a `geometry` callback, `snap`/`targets`, selection and move events | editor adapter targets those names (section 5.4) |
| fixed `pk-workspace` arrangement first | `pk-dock` is shipped with floating, rails, persistence | editor is a `pk-dock` from the start (Q9 answered) |
| four editor elements (`toolbox`, `layers`, `inspector`, `editor`) | the first three have no second consumer | one `pk-svg-editor` composing existing elements; extract an element only when a second consumer appears (STANDARDS: no local stand-ins) |
| module budgets estimated | measured limits: 4 KB element, 6 KB module | every module below is sized to fit, split rather than grown |

## 5. Proposal

### 5.1 Layers (bottom up; only the top touches the DOM)

```
Layer 4  elements     pk-svg-view (element), pk-svg-editor (component)
Layer 3  io + render  svg-io.js (toSvg, fromSvg, allow-list), svg-render.js (model -> DOM via factory)
Layer 2  ops          svg-ops.js, svg-align.js, svg-path.js, [geometry provider seam], svg-boolean (decision-gated)
Layer 1  model        svg-model.js (document, ids, matrices, limits, bounds, selection helpers)
```

All modules live in `core/js/` (flat, like `dock-*`), pure and node-tested, none importing a higher layer. Each is under the 6 KB gzip module limit by being split, not by a raised limit. Estimated gzip (to be measured in each PR): model + matrices 3 to 4 KB, bounds + selection 1.5, ops 2, align 1, path 3 to 4 (two modules if needed), io 3 to 4, render 1 to 2. A viewer pays model subset + render + io (about 6 to 8 KB, lazy); the editor loads on use and is not in the app entry graph.

### 5.2 Document model (as 09-28, with the decisions kept)

A document is `{ version, seq, width, height, units, title, desc, root }`; nodes `{ id, type, attrs, children? }`, ids `s<number>` from `seq`, never reused. Closed node set: `rect`, `ellipse` (circle is a case), `line`, `polyline`, `polygon`, `path`, `text`, `g`. All numbers finite and clamped by `LIMITS`.
Kept decisions: transforms are 6-number matrices in the model and strings only on export; bounds are computed (exact curve extrema for paths; group = union through matrices; oriented box available); selection is data beside the document, not undone as content; undo reuses `history.js` with a coalescing key so a drag is one step;
structural sharing so history holds references; `LIMITS` (nodes 5,000, depth 16, path segments 10,000, coordinate magnitude 1e6, input 2 MB) applied at every entry point; paths stored parsed as absolute `M/L/C/Z` segments.
Guarantees (property-tested like the layout model): `fromJson(toJson(doc))` equals `doc`; `fromSvg(toSvg(doc))` is a fixed point after one round; `fromSvg` returns a valid document for any input and never throws; every op keeps ids unique and limits intact.

### 5.3 Safe SVG in and out

One frozen allow-list table drives both directions so they cannot drift (the `NATIVE` idea of the layout model). Elements: `svg g rect ellipse circle line polyline polygon path text tspan title desc defs`. Attributes: geometry per element, `transform`, `fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray opacity fill-rule`, `id`, token-limited `class`, `role aria-label aria-hidden`, `viewBox width height xmlns`, `font-size`, allow-listed `font-family`, `text-anchor`.
Colours: strict grammar (hex, `rgb()`, `hsl()`, named list, `none`, `currentColor`, `var(--color-*)` for in-app use). `url(#id)` only to an id in the same document. **No `href`/`xlink:href`, `image`, `use`, `style` element or attribute, `foreignObject`, `script`, `on*`, animation, `a`, DOCTYPE, entities, CDATA, processing instructions or foreign namespaces** in the first releases (Q4).
`fromSvg(text, { limits }) -> { doc, problems }` checks byte length first, refuses DTDs before parsing, parses detached (`DOMParser` `image/svg+xml`; node tests take a parser as a parameter), walks once copying only allowed names/values, and turns everything else into `problems` (`{ code, severity, message, path }`, the layout model's shape). `toSvg(doc, { precision, compact, title, desc }) -> string` builds from the model, never the live DOM, escapes every value through one `esc()`, writes `viewBox` plus explicit `width`/`height` **with units** (mm and in matter), `role="img"`, `<title>`/`<desc>`, stable ids, and is byte-deterministic.
`render(doc, make)` builds nodes with `createElementNS`/`setAttribute`/`textContent` through a factory (as `chart.js`); no `innerHTML`, no new sink, no inline `style` (CSP). Editing chrome is styled by class with tokens. The icon pipeline may later reuse the allow-list instead of its regex lint (separate issue, not in this plan).

### 5.4 Elements, tiers and composition

| Element | Tier | Renders | C1/C4 check |
| --- | --- | --- | --- |
| `pk-svg-view` | `element` | an `<svg>` built by `render` from a `doc` property or `src` text via `fromSvg`; no `pk-*` | C4 ok (base HTML/SVG only) |
| `pk-svg-editor` | `component` | `pk-dock` panels: Layers (`pk-tree`), Canvas (`pk-canvas` hosting the rendered `<svg>`), Inspector (`pk-property-grid` fed by a pure `inspectorConfig`), plus a tool strip (`pk-toolbar`, `pk-button`) and an optional Source panel (`pk-code-view`) | names only element/component tiers (C1); no page/shell |

No `pk-svg-toolbox`, `pk-svg-layers`, `pk-svg-inspector` public elements until a second consumer asks (each is a panel inside the editor). An app that wants a route packages it as a `defineModule` module (`core/modules/svg-editor`), a consumer of the element, as the layout builder is.
Logic stays out of the 4 KB element budget: `svg-editor-logic.js` (pure controller: canvas event + tool -> op, drag state, keyboard command table, `snapTargets(doc)`, `inspectorConfig(doc, selection)`) is imported lazily; the element is a thin adapter. Ownership and reactivity rules apply (host owns attributes and light DOM; the editor owns its shadow tree; subscriptions outside it are added in `connected()` and removed in `disconnected()`; callbacks are properties; logging through `this.log`).

**Canvas contract (replaces 09-28 "assumed"):** the editor renders the document into `pk-canvas`'s default slot as one `<svg>` whose user unit equals a world unit (a document in mm has world unit = mm; `unit="mm"` on the canvas draws rulers). Item geometry for selection and snapping comes from the canvas `geometry` callback reading **model bounds** (numbers), not DOM measuring. The canvas select layer provides axis-aligned frames, marquee, move/resize and snap; the editor adds only what is SVG-specific (rotate handle, path-node editing, creation tools) as lazy tool modules. The canvas never learns about shapes; the toolkit never owns the view.

### 5.5 Public API sketch

```js
import { createSvgDoc, ops, alignPlan, toSvg, fromSvg } from 'plainkit/svg-model.js';
let doc = createSvgDoc({ width: 200, height: 100, units: 'mm', title: 'Sign' });
({ doc } = ops.create(doc, { type: 'rect', attrs: { x: 10, y: 10, width: 40, height: 20 } }));
const { doc: imported, problems } = fromSvg(text);   // sanitised; problems lists what was dropped
```
```html
<pk-svg-view label="Logo" src-text="..."></pk-svg-view>            <!-- property doc preferred; never innerHTML -->
<pk-svg-editor label="Sign editor" units="mm"></pk-svg-editor>
```
`pk-svg-view`: props `doc` (property), `label`, `title-hidden`; event `pk-svg-problems { problems }`; CSS `--pk-svg-view-fit`. `pk-svg-editor`: props `doc` (property), `tool`, `units`, `readonly`, `geometry` (property, Tier C provider), `label`; events `pk-svg-change { doc, reason }` (coalesced per gesture, one per undo step), `pk-svg-select { ids }`, `pk-svg-tool { tool }`, `pk-svg-problems`; methods `undo()`, `redo()`, `exportSvg(options)`, `import(text)`; parts `toolbar layers canvas inspector source`.

### 5.6 Operations tiers

- **A (document ops, exact):** create/remove/duplicate/group/ungroup (ungroup bakes the matrix)/reparent/order/transform/setAttrs, shape generators (star, polygon, rounded rect, arc, grid), alignment and distribution as pure plans `alignPlan(doc, ids, { axis, to }) -> [{ id, dx, dy }]`.
- **B (paths):** parse the full `d` grammar to absolute `M/L/C/Z`, `toD` with rounding, bounds, length/pointAt, reverse, transform, `simplify`, `flatten(tolerance)`. About 300 to 400 lines in two PRs.
- **C (offset and boolean):** the only computational-geometry risk. Recommendation unchanged from 09-28: ship **the provider seam** now (`setGeometryProvider`, UI and ops plumbing tested against a fake provider), decide between an in-house polygon clipper (flattened, polyline results) and an opt-in add-on package with evidence. A vendored library is rejected (no-dependencies rule, size, provenance). The seam adds nothing to core budgets.

## 6. Keyboard and accessibility

Equivalent operability, not pixel dragging by keyboard. The editor is `role="application"` only while the canvas is in edit mode (with a described-by keyboard help); otherwise the rendered `<svg>` is `role="img"` with the document title/desc (view mode, `pk-svg-view`).
Layers panel: the `pk-tree` keyboard model (arrows, Home/End, type-ahead, Enter to rename, Shift/Space multi-select). Canvas: the canvas keys (spec #430), plus `[` `]` rotate, `Ctrl+G` group, `Ctrl+Z` undo, Delete, duplicate; creating a shape without a pointer: pick a tool, press Enter, a default-size shape is placed at the view centre and selected, then the inspector sets exact values; path nodes edited with Tab/arrows. Tab order = DOM order (tools, layers, canvas as one stop, inspector), so docking rearrangements keep it meaningful.
Polite live region (the `notify.js` pattern, no new mechanism) announces selection ("Rectangle Door, 40 by 20 mm, at 10, 10"), results ("Grouped 3 shapes", "Undone: move") and import problems ("2 elements removed: script, foreignObject"), coalesced during key repeats. Tool buttons use `aria-pressed`. Exported SVG carries `role="img"`, `<title>`, `<desc>`, `aria-labelledby`, per-shape `<title>` for alt text, `aria-hidden` for decorative shapes, reading order = document order, `lang` when known; the editor asks for a title/description before export (a warning problem otherwise). Handles use shape plus colour; contrast, names and tap targets are covered by the UI review audits; no required animation.

## 7. Touch and phone

Below the phone breakpoint the dock flattens to a tab strip (Layers, Canvas, Inspector, one at a time), the canvas keeps one-finger pan and pinch, handles have 44 px hit areas, the tool strip becomes an icon-only toolbar with an overflow menu. Creation by tap-to-place (tool then tap), no drag required. `pk-svg-view` simply scales to its container (`max-inline-size: 100%`, no overflow).

## 8. Performance and size

- Structural sharing and id-keyed memoised bounds (a `WeakMap`); a drag is a preview transform on one `<g>` committed once on pointer-up; selection overlays are one layer; `render` patches by id.
- Hit testing from an id-keyed bounds index built lazily; precise tests via `isPointInFill/Stroke` in the browser, `flatten` in tests. Heavy work (simplify, boolean) is chunked or runs in a worker behind the provider seam.
- Targets, reported not asserted where machine dependent: create 1,000 shapes under 50 ms in node; a drag step under 4 ms at 2,000 shapes; import of 1 MB under 300 ms.
- Budgets never raised: modules each under 6 KB gzip (split if needed), `pk-svg-view` and `pk-svg-editor` each under 4 KB, with the editor's weight in lazy modules and `pk-dock`/`pk-canvas` reused, not forked. Neither element enters the app entry graph (22 KB cap). A node test asserts no static import from an element to a lazy module.

## 9. Blazor mapping notes (thin 1:1 wrapper)

`blazor/mappings/svg-view.json` and `svg-editor.json` generate `PkSvgView`/`PkSvgEditor`. The document crosses the boundary as **SVG text** (`Doc` string) sanitised by the same JS `fromSvg`; C# has no second model or sanitiser. Parameters `Doc`, `Tool`, `Units`, `ReadOnly`, `Label`; EventCallbacks `OnChange` (SVG string plus reason), `OnSelect`, `OnProblems`; `ExportAsync()` as an interop method. The geometry provider is JS-only (not mapped). `core/dist/svg-allowlist.json` is generated so a server can re-check user SVG; the docs say server-side re-sanitisation is a second check, not the first. No hand-written logic, timers or guards.

## 10. What pk-os (#598) would need, and what stays out of core

Nothing from the editor or Tier B/C. Possible light reuse, all opt-in and pure: `pk-svg-view` for sanitised wallpapers and imported app icons (the viewer is the safe path for third-party icons), and `svg-io.js`'s allow-list to vet an app's declared icon. Core stays tiny: no pk-os flag in any toolkit module; if pk-os wants vector icons it imports the viewer from the lazy chunk.

## 11. Testing plan

Node (written before code): matrices (identity, inverse, composition, decompose round trip), bounds (rect, rotated, arc-to-cubic, group union), path parse/serialise round trips, ops preserve invariants (seeded property test over random op sequences), alignment/distribution plans, history coalescing, `fromSvg` on a **hostile corpus** (scripts, handlers, `javascript:` hrefs, DTD and entities, oversized, deeply nested, huge coordinates, malformed numbers, foreign namespaces, `<use>` external) asserting no errors, no forbidden tokens in `toSvg` output, fixed-point round trip; `toSvg` determinism; the generated allow-list file matches the table; the import-graph test.
Browser cases (`core/tests/browser/`, rect comparisons): align-left leaves all selected `getBBox().x` equal; distribute gives equal gaps within 0.01; exported string re-imports to the same rendered `getBBox`; a group's `getBBox` equals the union of its children through their matrices; the sanitised view of the hostile fixture has zero `script`/`foreignObject`/handler nodes (`querySelectorAll` counts); `pk-svg-view` never overflows at 375; 2,000 shapes keep a drag step in budget (reported).
Scenarios: `svg-view-hostile` (problems listed, no layout break), `svg-editor-layout` (1280 and 375; `t.noOverlap`, `t.within`), `svg-editor-selection` (rotated rect handles, `t.ringUnclipped`, 44 px hit areas on phone), `svg-editor-keyboard` (create by keyboard, nudge, group, undo; live-region text read back), `svg-inspector-mixed` (mixed values), `svg-editor-rtl` (chrome mirrors, drawing does not), `svg-editor-in-dock` (float the inspector). Every screenshot opened with the Read tool.

## 12. Phased delivery

Each phase: one issue, one branch, one PR of about 400 hand-written lines or fewer, leaves `main` releasable, carries docs, gallery sample, skills workflow, Blazor mapping and a changelog fragment (`added`). Phases S1 to S6 need neither canvas nor dock.

| # | Phase | Depends on | Release value |
| --- | --- | --- | --- |
| S1 | `svg-model.js` core: document, node set, ids, `LIMITS`, matrices, JSON round trip (+ tests) | none | pure module |
| S2 | bounds (world and oriented), selection helpers, Tier A ops with shape generators | S1 | pure module |
| S3 | `svg-path.js` parse/serialise/bounds/flatten/simplify (may be two PRs) | S1 | pure module |
| S4 | alignment and distribution plans, `snapTargets(doc)` | S2 | pure module |
| S5 | **Safe I/O**: allow-list, `fromSvg`, `toSvg`, hostile corpus, generated `svg-allowlist.json` | S1 (S3 for `d`) | highest security scrutiny; its own review; first public API |
| S6 | `svg-render.js` + **`pk-svg-view`** + Blazor mapping + skill rule "never `innerHTML` user SVG" | S5 | **first user-visible release**: safe display of user SVG |
| S7 | `svg-editor-logic.js` (tools, drag, keys, `inspectorConfig`) | S2, S4, canvas C3 to C5 | pure module |
| S8 | `pk-svg-editor` shell: dock + canvas + tool strip; select, rect, ellipse, move | S7, dock D0 | first editor |
| S9 | Layers panel (`pk-tree`) and Inspector (`pk-property-grid`, mixed values, `pk-unit-input`) | S8, property-grid follow-up (Q10) | editing parity |
| S10 | export UI (download, copy, precision, units, Source panel via `pk-code-view`), import with problem list | S5, S8 | file workflows |
| S11 | Tier C provider seam and commands, fake-provider tests | S2, S9 | interface only |
| S12 | decision-gated: in-house polygon clipper or add-on package (own design note first) | S11, Q1 | |
| S13 | later, each its own issue: gradients/defs, `image` through `safe-url`, clipping, icon-pipeline reuse, the `svg-editor` module | S5, S9 | not committed |

## 13. Risks

- Sanitiser bypass: mitigated by one allow-list for both directions, size/depth limits before and during the walk, a hostile corpus, a dedicated review of S5, and "drop and report" rather than "try to fix".
- Geometry correctness in Tier B/C silently corrupts a fabrication file: Tier B is round-trip and fixture tested; Tier C is gated and isolated.
- Scope creep into a general vector editor: the non-goals list and one phase per capability.
- Budget: the editor stays lazy; each module is split before it nears 6 KB.
- Dependency on canvas select/snap layers (C3 to C5) delays the editor; the viewer and all pure modules are independent, so there is value earlier.
- Float precision on mm-scale output: fixed `precision`, tested determinism.

## 14. Open questions for the owner (recommended answer first)

1. **Boolean/offset path?** Recommend provider seam now (S11), then decide in-house polygon clipper vs opt-in add-on with evidence. "No dependencies" is absolute for core, not for a separately released add-on; polyline (flattened) results are acceptable at first.
2. **Canvas contract?** Recommend the section 5.4 contract (canvas owns view, grid, rulers, select/move, guides, snap; toolkit feeds geometry as numbers). Confirmed by the canvas spec C3 to C5.
3. **Ship S1 to S6 before any editor?** Recommend yes: they give a tested model, safe I/O and a safe viewer on their own.
4. **Allow-list strictness?** Recommend no `href`/`image`/`use`/`style`/gradients initially; dropped content is imported with a problem list rather than blocked.
5. **Units and formats?** Recommend mm/inch-first explicit `width`/`height`; SVG only (no DXF/PDF/PNG) for now.
6. **Rotated alignment?** Recommend axis-aligned world bounds first; oriented boxes later on request.
7. **History extraction?** Recommend no refactor: the SVG model uses the existing `js/history.js`; the layout builder keeps its own stack. (Merging the two is a separate cleanup issue if ever wanted.)
8. **Packaging and import path?** Recommend lazy ES modules imported by the elements, public path `plainkit/svg-*.js`; the editor route as a `defineModule` module later.
9. **Fixed arrangement before docking?** Moot: `pk-dock` exists; the editor uses it (needs the dock's `center` panel flag, dockable spec D1).
10. **Property grid additions?** Recommend yes: "mixed value" display and a `unit` field type as a small #429 follow-up before S9.
11. **One editor element or four?** Recommend one (`pk-svg-editor`) plus the viewer; extract panels only for a second consumer.
12. **Where does the document live in the editor?** Recommend the editor owns `doc` (current value) and raises `pk-svg-change`; a controlled mode only when Blazor server needs it.
