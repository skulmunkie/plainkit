# Canvas: finishing `pk-canvas` as the navigation and manipulation surface (refs #430)

Status: requirements and design for owner review. Docs only; no product code, no budget change. Refs #430 (does not close it); standing tracker #336.
Owner direction on #430 (2026-10-19): higher priority than pk-os (#598). Related: #431 (SVG toolkit), #432 (dockable workspace), #598 (pk-os, lowest of the four).

This **updates** `2026-09-28-canvas-design.md`. That spec was written before any canvas code existed; step 1 of it (the viewport module) and a first `pk-canvas`
have since shipped, with decisions that differ from its proposals. Where the two disagree, this one wins, and the section "What changed since 09-28" says why.

## 1. Goal and non-goals

Goal: a graphics or design tool (layout editor, signage or laser-cut designer, diagram, floor plan) gets one small, accessible surface that does pan, zoom, an
adaptive grid, guides, snapping, selection with move/resize, and one agreed coordinate system, without hand-rolling pointer maths. Pan and zoom are cheap and already
there; the rest arrives as **opt-in lazy layers** so a consumer who only wants pan and zoom keeps paying about 3 KB gzip.

Non-goals:

- No drawing engine: the canvas draws its own grid, rulers and selection chrome and hosts whatever the consumer slots (SVG, HTML, `pk-*`).
- No shapes, paths, boolean ops or SVG import/export (#431). The canvas exports coordinate helpers; it never imports #431.
- No docking, panels or toolbars (#432). The canvas is one pane that fills its container.
- No document model, undo or persistence. The consumer owns items and history (`js/history.js` is a ready pure stack); the canvas emits intent.
- No `<canvas>` 2D/WebGL renderer and no 100,000-item scale in this plan (see Q1). DOM and SVG children stay real elements: styleable by tokens, focusable, CSP-clean.
- No new base-class hooks and no reactive machinery (STANDARDS "Ownership and reactivity").
- No pk-os features (windows, desktop); see section 10.

## 2. Users and use cases

| User | Need | Served by |
| --- | --- | --- |
| Builder of a page/layout editor | frame a page at phone/tablet width, select nodes | `pk-design-surface` (exists, not a world-space canvas; stays) |
| Builder of a diagram or floor-plan tool | infinite 2D world, zoom to fit, pick, move, snap to grid and guides | `pk-canvas` + selection/move/snap layers (this spec) |
| Builder of a signage or laser-cut tool (#431) | millimetre world, rulers, guides, exact numeric placement, keyboard-only operation | `pk-canvas` + `unit`/rulers layer + the SVG editor on top |
| Keyboard or screen-reader user | every mouse action has a key; state is announced | section 6 |
| Phone or tablet user | pan with one finger, pinch, tap to pick, big handles | section 7 |
| Agent writing an app | one documented contract, a skill workflow | skills + guide row |

## 3. What exists today (verified on main, 2026-10-19)

- `core/components/canvas/` = `pk-canvas`, tier `component` (renders `pk-button`s for the toolbar). Props `zoom`, `panX`, `panY` (pixels from the frame's top-left to the world origin),
  `grid` (a single spacing in world units, 0 = none), `minZoom` 0.25, `maxZoom` 4, `label` (required). Events `pk-view-change { x, y, zoom }` (fired on **every** change while a gesture runs,
  so it already streams), `pk-canvas-pick { target, additive }`, `pk-canvas-key { key, shiftKey, altKey, ctrlKey }`. Methods `pointToWorld` (snaps to `grid`), `worldToPoint`, `reset`. Pointer events with
  capture, two-pointer pinch, middle button pan, Ctrl/Meta+wheel zoom, **plain wheel pans and always `preventDefault`s**, arrows pan 40 px, `+ - 0`. Selection frames are drawn for descendants the host flags
  `data-surface-selected`, found by a `MutationObserver` and measured with `getBoundingClientRect` (fine for tens of nodes). 2.82 KB gzip against the 4 KB element limit.
- `core/js/viewport-logic.js` (40 lines, 0.27 KB gzip): `toScreen`, `toWorld`, `pan`, `zoomAt`, `clampZoom`, node-tested. **`canvas.js` re-defines `clampZoom`, `toWorld`, `toScreen`, `zoomAt` itself** instead of
  importing it (two copies, slightly different `zoomAt` signature). That duplication is the first thing to remove.
- `core/elements/design-surface/` = `pk-design-surface` (tier element): a scrolling ground that frames a page at full/tablet/phone width with selected, drop, hidden and empty marks and an action chip. It is the layout
  builder's canvas. It has no world transform; it is not replaced by `pk-canvas`.
- `core/js/history.js` (shared `createHistory`, `record`, `undo`, `redo`, coalescing), `core/js/roving.js`, `core/js/shortcuts.js` (`registerChord`), `core/js/breakpoints.js`, `core/js/positioning.js`: reusable.
- Blazor: `PkCanvas` generated from `blazor/mappings/canvas.json` with bUnit coverage of view-change, pick and key.
- Not present: guides, snapping beyond the grid, multi-selection, marquee, move/resize handles, coordinate contract on items, zoom-to-fit, bounds, rulers, units, reduced-motion handling, RTL key mirroring,
  adaptive grid levels, world-space overlay slot, announcements.

## 4. What changed since 09-28 (decisions already made by shipped code)

| 09-28 proposal | Shipped | This spec |
| --- | --- | --- |
| viewport `{x,y,zoom}` = world point at the top-left | `{x,y,zoom}` = pixels of the world origin (`panX`, `panY`) | keep shipped form; no breaking change. Q4 answered: three props stay |
| `pk-viewport` commit event | `pk-view-change` streaming | keep; add nothing. Q5 answered |
| coordinate contract `data-x/y/w/h` on children | DOM measuring of flagged nodes | measuring stays for the existing marks; the contract is added as the **opt-in geometry source** for the selection/snap layers (section 5.3). Q2 answered: both |
| name `pk-canvas` | `pk-canvas` | keep. Q12 answered |
| tier unspecified | `component` | keep (renders `pk-button`) |

## 5. Proposal

### 5.1 Elements and tiers

No new public element in phases C1 to C5. `pk-canvas` (tier `component`, C1/C4: it names only `pk-button`, an element) gains behaviour in **lazy modules** imported on first use, the way `pk-dock` imports `dock-*.js`:

| Module (`core/js/`) | Pure? | What | Budget (gzip, jsModule limit is 6 KB; targets, measured per PR) |
| --- | --- | --- | --- |
| `viewport-logic.js` | yes | existing transforms plus `zoomToRect`, `zoomToFit`, `centerOn`, `zoomStep` ladder, `wheelToZoom`, `gridSteps`, `gridPhase`, `clampPan` | 0.27 now, target under 1.5 |
| `canvas-geometry.js` | yes | `hitTest`, `marquee`, `combine`, `handles`, `resizeRect`, `visibleRects` (linear) | under 2 |
| `canvas-snap.js` | yes | `snapValue`, `snapRect(rect, { grid, guides, targets, threshold, edges })` returning `{ rect, hits }` | under 1.5 |
| `canvas-select.js` | DOM | overlay, marquee, handles, drag, nudge, live announcements; imported when `selectable` is set | under 3 |
| `canvas-rulers.js` | DOM | rulers, guides creation, units | under 2.5 |

`pk-canvas.js` itself must stay under its 4 KB element limit (2.82 now); it only grows by the few lines that import the layers. If it does not fit, code moves out into a module, the limit is never raised.
Optional later (not committed): `pk-canvas-minimap` (tier element or component, a consumer of the view API), only on request.

### 5.2 Coordinate system (decisions, written down once)

- World units are **unitless numbers, y down, origin at the world's own (0,0)**, doubles. They are never mirrored in right-to-left pages: a drawing is geometry, not text (Q6). Only keyboard direction (Left/Right pan) and the chrome mirror.
- Screen/frame pixels are relative to the frame's top-left, as today. `pointToWorld`/`worldToPoint` take and return client pixels as today; add `frameToWorld`/`worldToFrame` only if a layer needs them.
- Units: a `unit` attribute (`none` default, `px`, `mm`, `in`, `pt`) and `px-per-unit` (default derived from CSS: mm = 96/25.4) only affect rulers and readouts, never the stored numbers. An SVG document in mm renders with world unit = user unit (see the SVG spec).
- Zoom is clamped so world-to-screen stays under about 1e6 px; optional `bounds` limits panning.

### 5.3 Geometry contract and selection (the central choice)

Two sources, one rule: **the canvas never writes to slotted children** (host owns light DOM).

1. *Measured* (exists): descendants flagged `data-surface-selected` get a frame from `getBoundingClientRect`. Unchanged; fine for tens of nodes; no snapping or marquee.
2. *Declared* (new, needed for select/marquee/snap/move): a child carries its world rect as `data-x data-y data-w data-h` plus `data-id` (SVG children may use their own `x y width height`), and optionally `data-r` (rotation degrees about its centre). A `geometry` **property**
   (callback `(el) => { x, y, w, h, r? } | null`, business logic so never an attribute) overrides the default reader, which is how the SVG editor feeds model bounds with no DOM reads. Items without geometry are simply not selectable (a background image).

The selection layer reads numbers, so hit testing, marquee, snapping and handle drawing do no layout reads in `pointermove`.

### 5.4 Public API additions (existing names kept)

Attributes and properties (new): `selectable` (boolean; loads the select layer), `mode` (`select` | `pan`, default `select`; `pan` makes primary-drag on empty ground pan), `selection` (array of ids; property + `selection` JSON attribute, commit `pk-canvas-select`), `snap` (space list of `grid guides edges centres`, default off), `snap-threshold` (screen px, default 6), `guides` (property array `{ axis: 'x'|'y', at }`), `bounds` (`{x,y,w,h}`), `readonly` (view only: pan/zoom work, no move/resize), `rulers` (boolean), `unit`, `px-per-unit`, `geometry` (property callback), `targets` (property: extra snap rects the consumer supplies), `wheel` (`auto` | `zoom` | `pan` | `page`; Q7). `grid` stays a number and gains `grid="auto"` meaning adaptive levels from `gridSteps` (1, 5, 10, 50... so the on-screen gap stays between 8 and 16 px).

Events (all `pk-` prefixed, bubble, composed, consistent with `pk-view-change`): `pk-canvas-select { ids }`, `pk-canvas-move { moves: [{ id, x, y }], done }` and `pk-canvas-resize { id, x, y, w, h, done }` (both cancelable; the host writes values back, the canvas does not), `pk-canvas-guide { guides }`, `pk-canvas-hover { id|null }` (rAF-limited, mirrors `pk-surface-hover`), `pk-canvas-delete-request` is **not** added: the existing `pk-canvas-key` already carries Delete/Escape.

Methods (new): `zoomToFit(rect?)`, `zoomTo(z, anchor?)`, `centerOn(x, y)`, `reveal(idOrNode)`, `select(ids)`, `clearSelection()`, `frameToWorld`/`worldToFrame` if needed. Existing `pointToWorld`, `worldToPoint`, `reset` keep their behaviour.

Slots: default (items, world space, as now); `overlay` (screen space, consumer chrome such as a floating tool palette; positioned by the host with `worldToPoint`); `background` (world space under the grid, e.g. an artboard). Parts: existing `frame world overlay out in reset toolbar level mark` plus `handle`, `marquee`, `guide`, `snap-line`, `ruler`.
CSS hooks (tokens only): existing `--pk-canvas-bg`, `--pk-canvas-grid`, `--pk-canvas-width`, `--pk-canvas-height` plus `--pk-canvas-grid-major`, `--pk-canvas-selection`, `--pk-canvas-handle-size`, `--pk-canvas-guide`, `--pk-canvas-ruler-size`. No literal colours or sizes.

### 5.5 Rendering and input

Grid stays a CSS background from `--ds-*` custom properties (no DOM per line, resolution independent); the select layer's overlay is SVG in the shadow tree with `pointer-events` only on handles. Pan and zoom write CSSOM properties in one rAF batch, `will-change: transform` only during a gesture.
Input stays pointer events with capture on the frame (no document-level listeners; nothing to remove in `disconnected()` beyond the existing observers). `ResizeObserver` and `MutationObserver` stay in `connected()`/`disconnected()`.

## 6. Keyboard and accessibility

The frame is a focusable `role="group"` with `aria-roledescription="canvas"`, named by `label` (required, warns once if empty: exists). Items are real elements the consumer supplies and keep their own roles and tab stops; the canvas does not steal Tab. The decoration (frames, handles, rulers) is `aria-hidden`.

| Keys (frame or selected item focused) | Action |
| --- | --- |
| Arrows | pan 40 px (exists); with a selection and `selectable`: nudge by one grid step, Shift ten, Alt one screen pixel |
| Left/Right | mirrored for pan in RTL; world coordinates never mirror |
| `+` `-` `0` | zoom on the step ladder, reset (exists); `1` or Home: fit; `Ctrl+A` select all (selectable) |
| Tab / Shift+Tab | moves between items in DOM order; Escape clears selection or cancels a drag, a second Escape is reported through `pk-canvas-key` |
| Delete | reported as `pk-canvas-key` (exists); the host decides |
| Space held + drag | pan (pointer) |

Every pointer operation (select, marquee, move, resize, create guide) has a keyboard path: select by Tab or `select-next` keys, move/resize by arrows with modifiers, guides created from a menu item or the `guides` property (WCAG 2.5.7). One polite live region (part `status`) announces zoom ("Zoom 150 percent"), selection ("3 items selected"), and a completed move ("Moved to 120, 80"), coalesced, never during a drag. Focus stays on the frame or the selected item; a marquee never moves focus. Reduced motion: `zoomToFit`/`centerOn` jump when `prefers-reduced-motion: reduce`; wheel and pinch never animate. Forced colours: selection and handles use system colours and outlines with shape, never fill alone. Contrast and tap targets are covered by the UI review audits.
**Wheel**: today plain wheel is always captured, which traps page scroll when a canvas sits in a long page. Q7 recommends `wheel="auto"`: Ctrl/Meta+wheel and pinch zoom always; plain wheel pans only when the frame has focus or `mode="pan"`; otherwise it passes through. This is a behaviour change to ship in phase C1 with a changelog `changed` entry.

## 7. Touch and phone

One finger pans on bare ground (or drags a selected item), two fingers pinch and pan, a tap picks; `touch-action: none` on the frame (documented: do not make the canvas the whole scrolling page). Handles draw small but have a hit area of at least 44 px (`--touch-target`); the toolbar folds to icons at phone width (exists). Rulers are hidden below the phone breakpoint; guides are creatable from a menu item. The select layer is lazy, so a phone read-only viewer never loads it. Long-press is left to the consumer (context menu via `pk-context-menu`).

## 8. Performance, size and budgets

- Pan/zoom: one transform and one grid-variable write per frame; no layout reads in `pointermove` (rects come from the contract numbers). Read the frame rect once per gesture start and on `ResizeObserver`.
- Scale: slot mode is documented to a few thousand light-DOM nodes. `items`/`renderItem` culling (Q3) is **not** in this plan; `visibleRects` ships as a pure helper (linear scan), and an items mode only starts when a consumer shows more than about 2,000 live nodes. The browser case asserts the number so the claim is checked.
- Budgets (never raised): element `canvas.js` 4 KB (2.82 now), modules 6 KB each (table in 5.1), page layer untouched. Each PR reports measured sizes; over budget means moving code to a lazy module or deleting it, not a bigger number. `selectable` pages pay the select layer only on first use.
- A node test fails if `canvas.js` statically imports a layer (graph check, like the rich-text editor's).

## 9. Blazor mapping notes (thin 1:1 wrapper)

`blazor/mappings/canvas.json` already exists; each phase adds entries, nothing hand-written: `Selectable`, `Mode`, `Snap`, `SnapThreshold`, `Wheel`, `Rulers`, `Unit`, `ReadOnly`, `Bounds` and `Guides` (JSON props, `"extra": true` where they would grow a hand-written file), `Selection` as a `@bind` pair on `pk-canvas-select`, EventCallbacks for move/resize/guide/hover, methods as interop calls (`ZoomToFitAsync`, `RevealAsync`). `ChildContent` is slot mode (Blazor renders items, and writes `data-x/y/w/h` from C#). `geometry`, `targets`-callback and any `renderItem` are JS-only and are **not mapped**; the docs say Blazor uses data attributes. No timers, no stale-load guards, no layout recipes in the component (`blazor-wrapper.test.mjs`).

## 10. What pk-os (#598) would need, and what stays out of core

pk-os (its own package under `apps/`, lowest priority) needs **nothing** from the canvas for windows: its window model is the dock's floating layer (see the dockable spec). Optional later pieces it could reuse: `canvas-snap.js` (pure; snapping desktop icons to a grid) and `viewport-logic.js` for an exposé-style zoomed overview. Neither changes core: they are the same lazy pure modules. pk-os adds no canvas attribute, no canvas event and nothing to `pk-canvas.js`. Rule: if pk-os ever wants a canvas feature, it goes in as a lazy module with a general API, not a pk-os flag.

## 11. Testing plan

Node: `viewport-logic.test.mjs` property tests (`toWorld(toScreen(p)) == p`; `zoomAt` keeps the anchor's world point fixed within epsilon; `zoomToFit` result contains the bounds; `gridSteps` keeps the gap in band across a zoom sweep; `snapRect` idempotent; marquee over everything selects everything), `canvas-geometry` and `canvas-snap` tests (handles, `resizeRect` with ratio/centre, snap hits, threshold in screen px), key-table test, the import-graph test above, element meta/API test (`ownership.test.mjs` shows `writes` stays empty for slotted children).
Browser cases in `core/tests/browser/` written before the CSS: frame fills its container at zero and non-zero sizes; `world` transform equals the reported view; `touch-action: none`; `pointToWorld(worldToPoint(p))` round-trips; a drag emits `pk-canvas-move` in world units not pixels; with `wheel="auto"` a plain wheel over an unfocused canvas scrolls the page and a Ctrl+wheel zooms with the anchor's world point unchanged within 1 px; grid line gap stays in band over ten zoom steps; select layer not loaded until `selectable` (module request check); 2,000 declared items stay selectable and a pan step stays under a stated frame budget (reported, not asserted where machine dependent).
Scenarios (`core/tests/review/scenarios/`): `canvas-zoom-anchor`, `canvas-pan-keyboard`, `canvas-select-marquee`, `canvas-move-resize` (handles `t.ringUnclipped`, hit areas), `canvas-snap` (snapped rect and a visible snap line; none beyond threshold), `canvas-rulers-guides`, `canvas-rtl` (keys mirror, world does not), `canvas-reduced-motion`, `canvas-in-dock` (resizing the pane resizes the canvas, origin kept, `t.within`), phone 375 variants. Every screenshot opened with the Read tool.

## 12. Phased delivery

Each phase is one issue, one branch, one PR of about 400 hand-written lines or fewer, leaves `main` releasable, and carries docs, a gallery sample, skills workflow text, the Blazor mapping change and a changelog fragment. Only the first PR of the batch should be open at a time.

| # | Phase | Depends on | Notes |
| --- | --- | --- | --- |
| C1 | **Consolidate and fix**: `canvas.js` imports `viewport-logic.js` (delete its copies); add `zoomToFit`, `centerOn`, `zoomStep`, `clampPan`; `wheel` attribute and the pass-through default; reduced motion; RTL key mirror; live region; methods `zoomToFit`, `zoomTo`, `centerOn` | none | net-negative size on `canvas.js`; the wheel change is the only behaviour change |
| C2 | **Adaptive grid and units**: `gridSteps`, `grid="auto"`, `unit`, `px-per-unit`, readout; `rulers` as a lazy module with `ruler` parts | C1 | rulers may be its own PR |
| C3 | **Selection layer**: contract (`data-*`, `geometry`), `canvas-geometry.js`, `canvas-select.js`, `selection`, `pk-canvas-select`, marquee, shift toggle, Tab/`Ctrl+A`, announcements | C1 | the first lazy layer; sets the import-graph test |
| C4 | **Move, resize, nudge**: handles, `resizeRect`, cancelable `pk-canvas-move/resize`, `readonly`, keyboard nudge | C3 | rotation display only (no rotate tool; Q9) |
| C5 | **Guides and snapping**: `canvas-snap.js`, `snap`, `snap-threshold`, `guides`, `targets`, `pk-canvas-guide`, snap lines | C4 | |
| C6 | **Guide and review pass**: scenarios not yet added, "build an editor" skill workflow, worked example (canvas in a `pk-dock` pane), `canvas-in-dock` | C1 to C5, dock | docs-heavy, small |
| C7 | Optional: minimap, items/`renderItem` culling | C3, evidence | each only on a stated need |

Ordering across the three issues (answers Q13): C1 and C2 and the dock's remaining phases (D0 to D3) are independent and can run in parallel branches one PR at a time; the SVG toolkit's pure phases (S1 to S6) need no canvas; the SVG editor (S8) needs C3 to C5. Recommended sequence: C1, D0, S1, C3, S2, C4, C5, D-phases and S-phases interleaved, then the editor.

## 13. Risks

- The wheel change breaks a consumer who relied on plain-wheel pan: mitigated by the `wheel="pan"` value and a `changed` fragment with the one-line migration.
- `canvas.js` is already 70 percent of its budget; discipline is lazy layers, enforced by the graph test.
- Two geometry sources (measured marks and the declared contract) can confuse; the docs show the rule (measure for decoration, declare for interaction) and a single sample for each.
- Rotated items and paths need oriented handles; axis-aligned handles are the first cut, which is why rotation stays out (Q9).
- DOM at scale: documented ceiling, enforced by a case, not promised.
- Pointer maths bugs are subtle; they live in pure modules with property tests, the cheapest place to find them.

## 14. Open questions for the owner (recommended answer first)

1. **Renderer: DOM/SVG or `<canvas>`?** Recommend DOM/SVG; items stay elements. Revisit only with a consumer that needs more than about 2,000 live items.
2. **Item geometry source?** Recommend both: measured for decoration (as shipped), declared (`data-*` or the `geometry` callback) for interaction.
3. **Slot mode vs `items`/`renderItem`?** Recommend slot mode only now; items mode only on evidence; Blazor never needs the callback.
4. **Viewport as three props or one object?** Recommend keep `zoom`/`panX`/`panY` as shipped (answered by code).
5. **Event cadence?** Recommend keep `pk-view-change` streaming as shipped; no second event.
6. **RTL?** Recommend world never mirrors; keys and chrome do.
7. **Plain wheel?** Recommend `wheel="auto"` (zoom with Ctrl/pinch always; pan only focused or in `pan` mode; else pass through), shipped in C1 as a `changed` entry.
8. **Units and rulers: canvas or toolkit only?** Recommend the canvas owns `unit`, rulers and readouts (lazy), so any editor gets them; the toolkit supplies the document's unit.
9. **Group rotate/scale?** Recommend out of C4; axis-aligned resize first, rotation as an editor concern (SVG phase), revisit after C5.
10. **Undo?** Recommend consumers own history via `js/history.js`; no undo helper in the canvas.
11. **Size ceiling?** Recommend the element stays under its 4 KB limit and each lazy layer under 3 KB gzip, measured in PRs; the limits are not touched.
12. **Name?** Recommend keep `pk-canvas` (shipped, documented).
13. **Ordering across #430, #431, #432?** Recommend section 12's interleave; the one hard dependency is C3 to C5 before the SVG editor.
