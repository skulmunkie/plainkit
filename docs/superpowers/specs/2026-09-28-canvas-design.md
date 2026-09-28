# Canvas: a viewport model and a thin `pk-canvas` element

Status: proposed design for owner review (issue #430), not planned or implemented. Refs #430, #431 (SVG toolkit), #432 (dockable layout), tracker #336.

## Why

Graphics and design tools (a layout editor, a signage or laser-cut designer, a diagram tool, a floor plan) all need the same surface: a large 2D
world seen through a window that can be panned and zoomed, a grid that stays crisp, guides, snapping, a selection with move/resize handles, and one
agreed coordinate system so that a pointer position, a stored shape and an on-screen box can be converted to each other. No `pk-*` element covers
this today, and every consumer would hand-roll the pointer math, the wheel/pinch handling and the keyboard model, each slightly differently and
usually without accessibility.

The gap is large only if it is built as a graphics engine. It is small if it is built the way the SDK builds everything else: a pure, unit-tested
model, a thin element that wires it to the DOM, and consumers (and the SVG toolkit) that build on top.

## Non-goals

- **No drawing engine.** `pk-canvas` does not draw shapes, paths, text or images. It draws its own background grid and its own selection chrome, and
  hosts whatever the consumer puts in it (SVG, HTML, `pk-*` elements).
- **No SVG creation/manipulation utilities.** Shape generation, path operations, boolean ops and export are #431 and sit **on** the canvas, not in
  it. The canvas exports coordinate helpers that #431 imports; the canvas never imports #431.
- **No docking, panels or toolbars.** Toolbox | Canvas | Properties is #432, composed from the canvas as one pane.
- **No document model, undo or persistence.** The consumer owns its items and history (the layout builder's `layout-model.js` and `history.js` are the
  precedent). The canvas reports intent through events; it does not store items.
- **No new base-class hooks and no reactive machinery** (STANDARDS "Ownership and reactivity", rules 6 to 10).
- **No `<canvas>` 2D/WebGL renderer in the first releases.** See open question 1.

## Design in layers

Each layer is usable without the ones above it; each is small.

### Layer 0: `core/js/viewport-logic.js` (pure, no DOM)

Follows the `*-logic.js` pattern (`layout-builder-logic.js`, `menu-logic.js`, `splitter`'s exported `clampSize`/`pointerSize`): plain functions and small
immutable values, exported for node tests, imported by the element, the Blazor wrapper's docs and #431.

A viewport is `{ x, y, zoom }`: the world point shown at the container's top-left, and the scale (screen px per world unit). All functions return a
new viewport; none read the DOM. Rectangles are `{ x, y, w, h }`.

- Transforms: `worldToScreen(vp, p)`, `screenToWorld(vp, p)`, `rectToScreen`, `rectToWorld`, `transformCss(vp)` (the one `translate/scale` string the
  element writes).
- Pan and zoom: `panBy(vp, dx, dy)`, `zoomAt(vp, factor, anchorScreen, { min, max })` (keeps the world point under the anchor fixed, the invariant
  every zoom bug breaks), `zoomToFit(vp, bounds, box, { padding, min, max })`, `zoomToRect`, `centerOn`, `clampZoom`, `clampPan(vp, bounds, box, { slack })`
  (optional world bounds).
- Steps: `zoomStep(zoom, dir, steps)` (a fixed ladder such as 12.5 to 6400 percent so keyboard zoom lands on round values), `wheelToZoomFactor(deltaY, deltaMode, ctrlKey)`
  (normalises line/page/pixel wheels, treats ctrl+wheel and trackpad pinch as zoom), `pinch(prev2, next2)` (two touch points to `{ dx, dy, factor, anchor }`).
- Grid: `gridSteps(zoom, { base, minPx })` returns the minor and major spacing in world units so the on-screen gap stays between minPx and 2x minPx (the grid
  "levels" as you zoom: 1, 5, 10, 50...), plus `gridPhase(vp, step)` (the offset of the first line, for the background position).
- Snapping: `snapValue(v, step)`; `snapPoint`; `snapRect(rect, { grid, guides, targets, threshold, edges })` returning `{ rect, hits }` where a hit is
  `{ axis, kind: 'grid'|'guide'|'edge'|'centre', at }` (so the element can draw the snap line); the threshold is given in screen px and converted with the
  zoom, so it feels the same at any scale. Item targets are a plain array of rects the consumer supplies; there is no scene knowledge in here.
- Selection: `hitTest(rects, p)`, `marquee(rects, box, { mode: 'touch'|'contain' })`, `combine(selection, ids, mode: 'replace'|'add'|'toggle')`, and
  `handles(rect)` / `resizeRect(rect, handle, delta, { keepRatio, fromCentre, min })`.
- Culling: `visibleRects(items, vp, box, { margin })` (linear scan, plus an optional uniform-grid `createIndex(rects, cell)` for very large sets; see performance).
- Keyboard: `keyAction(event-like, ctx)` maps a key plus modifiers to `{ type: 'pan'|'zoom'|'nudge'|'select-next'|..., ...}` so the whole keyboard model is
  testable without a DOM (the `keySize`/`menu-logic` pattern), including the RTL mirror of Left/Right.

Tests (`core/js/viewport-logic.test.mjs`, node): property tests for the invariants (`screenToWorld(worldToScreen(p)) == p`; `zoomAt` leaves the anchor's
world point fixed within epsilon; `zoomToFit` result contains the bounds; snap is idempotent; marquee of the whole area selects everything), plus the
key table. This is where most of the risk lives, and it runs in milliseconds.

### Layer 1: `pk-canvas` (thin element)

Owns exactly: the viewport (its two-way prop), the grid layer, input (wheel, pinch, drag-pan, keyboard), the selection overlay and snap guides. Uses
`viewport-logic.js` for every calculation. Shadow tree (all owned by the element):

```
root (role="application"-free container: role="group", tabindex=0, aria-roledescription="canvas")
  grid       background layer: CSS background (repeating linear-gradient) sized and offset from gridSteps/gridPhase; no DOM per line
  world      transformed layer: transform = transformCss(vp); slot="" lives here (the consumer's items)
  overlay    selection boxes, resize handles, marquee, snap lines, rulers/guides (SVG, pointer-events only on handles)
  status     visually hidden live region ("Zoom 150 percent, 3 items selected")
```

The consumer's items are light-DOM children in the default slot, so the host owns them (rule 1, 3). The canvas never rewrites, reorders or removes them.
How it knows their geometry is the design's central choice (open question 2); the default proposed here is a **coordinate contract on the child**: a child
carries its world rect as `data-x data-y data-w data-h` (or `x y w h` attributes for SVG children, read by name), plus `data-id`. The canvas reads
these to hit-test, draw selection boxes and snap. It writes nothing to them: moving an item is `pk-canvas-move` with the new rects, and the host
writes them back (rule 4: after the commit event the host owns the value). Items outside that contract (a big background image) are simply not
selectable.

Grid rendering: a CSS background with `background-size`/`background-position` from `gridSteps`/`gridPhase`, two gradients (minor, major). Zero DOM, no
canvas, resolution independent, updated with one style write per viewport change. Colours come from tokens (`--color-border`, `--color-border-strong`).
Because the SDK bans inline `style` attributes only in markup (CSP `style-src 'self'`), the element sets **CSSOM properties** (`el.style.setProperty`,
`el.style.transform`), which CSP allows; this is the same technique other elements use for measured values. To confirm in the implementation issue by
grep of existing elements.

Input model (all pointer events with capture on the root, the `pk-splitter` pattern: `grab`/`drag`/`drop`, `pointerup|pointercancel|lostpointercapture`):

- Pan: space+drag, middle-button drag, or (mode `pan`) primary drag on empty space; two-finger drag on touch; wheel/trackpad scroll without ctrl.
- Zoom: ctrl/cmd+wheel and trackpad pinch (the browser reports pinch as ctrl+wheel), two-finger pinch on touch, `+`/`-`/`0` keys, and the methods.
- Select: click, shift/ctrl toggle, marquee from empty space (mode `select`, default).
- Move: drag a selected item; nudge with arrows.
- Wheel listener is non-passive (it must `preventDefault` to stop page zoom); it is added on the element itself so it goes with it (rule 5: no
  document-level subscription; pointer capture keeps a drag alive outside the box).

### Layer 2: consumers and neighbours

- **Item rendering** is the consumer's: slotted markup, or (for Blazor and for very large sets) a `renderItem`-style callback property. Proposed
  contract: `items` (array of `{ id, x, y, w, h, ... }`, business data) and `renderItem(item, el)` (a callback property, never an attribute) which the
  canvas calls for **visible** items only and removes for culled ones; the canvas then owns those item nodes inside `world` (a second, explicit mode,
  because the "host owns light DOM" rule forbids the canvas touching slotted children). Slot mode is default, `items` mode is for scale. Open question 3.
- **SVG toolkit (#431)** imports `viewport-logic.js` for coordinates and snapping and provides shapes, transforms, path ops and export as pure modules
  (`svg-*.js` + tests). Its optional element (`pk-svg-canvas` or simply slotting an `<svg>` into `pk-canvas`) is a consumer. Suggested order: canvas first.
- **Docking (#432)** hosts `pk-canvas` as the centre pane of a dock layout; see the next section.
- **Layout builder** (`modules/layout-builder`) is the existing precedent for select, drag, arrow-key move and undo; its `history.js` and the
  `layout-builder-logic.js` key rules are reused by name in a canvas-based editor, not copied. It does not need to be migrated.

## The relation to #432 (dockable layout) and #431 (SVG)

Neither is designed here; this records what the canvas asks of them so the three passes agree.

- **#432:** existing pieces already cover half of it: `pk-splitter` (resize), `pk-workspace` (nav/main/aside), `pk-drawer` docked mode, `pk-sortable`
  (reordering). The lean route is a **pure dock-layout model** (`dock-model.js`: a tree of splits/tabs/floats as JSON, operations `dock`, `float`,
  `resize`, `collapse`, serialisation, like `layout-model.js`), rendered by composing `pk-splitter` and `pk-tabs`, with floating panels as a small
  positioned element. It needs nothing from the canvas except that `pk-canvas` fills its container and reports its size, so canvas and dock can ship in either order.
- **#431:** starts as pure modules (creation, transforms, bounding boxes, alignment, path ops, export to SVG string) with node tests; any element is
  thin. It shares `Rect`/`Point` helpers with `viewport-logic.js`, so those are exported from one place, and the canvas exposes `snapRect` for alignment
  helpers. Boolean ops and offsetting are the heavy part and are their own later issue.

## Public API sketch

Props (business values are properties; simple ones also attributes):

| Prop | Type | Notes |
| --- | --- | --- |
| `zoom` | number, default 1 | two-way, commit `pk-viewport`; clamped to `min-zoom`..`max-zoom` |
| `x`, `y` | number | the viewport origin in world units, two-way, commit `pk-viewport` (or one object prop `viewport`; open question 4) |
| `min-zoom`, `max-zoom` | number, 0.1 / 8 | |
| `grid` | boolean/enum `none\|lines\|dots` | default `lines` |
| `grid-size` | number, default 8 | base world unit; levels scale with zoom |
| `snap` | boolean or list `grid,guides,edges` | default off; `snap-threshold` in screen px, default 6 |
| `guides` | array of `{ axis, at }` | property; user-created guides raise `pk-guide` |
| `selection` | array of ids | two-way, commit `pk-select` |
| `mode` | `select\|pan` | |
| `bounds` | `{x,y,w,h}` | optional pan limit |
| `readonly`, `disabled` | boolean | view-only: pan/zoom still work, no move/resize |
| `items`, `renderItem` | array, callback | items mode only |

Events (all bubble, composed, `pk-` prefix, detail carries the new value): `pk-viewport` `{ x, y, zoom }` (commit, after a gesture ends or per
rAF while it runs: open question 5), `pk-select` `{ ids }`, `pk-move` `{ moves: [{ id, x, y }], done }` (cancelable), `pk-resize-item` `{ id, x, y, w, h, done }`,
`pk-guide` `{ guides }`, `pk-canvas-click` `{ x, y }` (world point, for tools that create things).

Methods: `zoomIn()`, `zoomOut()`, `zoomTo(z, anchor?)`, `zoomToFit(rect?)`, `panTo(x, y)`, `centerOn(x, y)`, `screenToWorld(p)`, `worldToScreen(p)`,
`select(ids)`, `clearSelection()`. The last two of the coordinate set are the "coordinate-system API" the issue asks for, one-liners over layer 0.

Slots: default (items in world space), `overlay` (consumer chrome positioned in screen space, e.g. a floating toolbar), `background` (world-space, under the grid, e.g. an artboard or page outline).

CSS hooks: `--pk-canvas-grid-minor`, `--pk-canvas-grid-major`, `--pk-canvas-background`, `--pk-canvas-selection`, `--pk-canvas-handle-size`,
`--pk-canvas-guide`, `--pk-canvas-height` (like `--pk-splitter-height`; the element is `display: block; block-size: 100%` otherwise). Parts: `root`, `grid`, `world`, `overlay`, `handle`.
All tokens, no literal colours or sizes.

### Accessibility

A canvas is the hardest control to make accessible; the commitment here is that every mouse operation has a keyboard equivalent and that state is announced.

- Root is a focusable `role="group"` with `aria-roledescription="canvas"` and an accessible name (`label` prop). Items are real focusable elements supplied by
  the consumer; the canvas gives them roving order by the consumer's DOM order (Tab moves between items; the canvas does not steal Tab).
- Keys (on the canvas or a selected item): arrows pan (no selection) or nudge the selection by one grid unit (shift: ten; alt: one screen pixel); `+`/`-`
  zoom, `0` resets, `1` fits; `Home` fit; `Delete` raises `pk-delete-request` (the consumer decides); `Escape` clears the selection or cancels a drag;
  `Ctrl+A` selects all; space held pans. Left/Right mirror in RTL for pan; world coordinates themselves are never mirrored (the drawing is geometry, not text),
  which is recorded as decision for open question 6.
- Live region announces zoom changes ("Zoom 150 percent"), selection count, and a completed move ("Moved to 120, 80"), debounced; never during a drag.
- Focus is managed on the canvas: after a selection change the selected item keeps or receives focus; a marquee never moves focus.
- Reduced motion: `zoomToFit` and `centerOn` animate a transform transition only when `prefers-reduced-motion: no-preference`; otherwise they jump. Wheel and
  pinch never animate (direct manipulation).
- Touch: `touch-action: none` on the root (required for pinch and pan; documented, as it blocks page scroll over the canvas, so the canvas must not fill a
  scrolling page edge to edge), handles at least 44 px hit area via the existing tap-target audit, two-finger pan and pinch, long-press for context (consumer).
- Contrast of the selection and handles is checked by the UI review audits; handles never rely on colour alone (shape and outline).
- Zoom never changes the layout size of the surrounding UI; it is scoped to the world layer (a page-level 200 percent zoom must still work, and the
  canvas must not trap wheel scrolling without ctrl: plain wheel pans only when the canvas has focus or is in `pan` mode, otherwise it lets the page scroll; open question 7).

## Performance

- **Transform-only updates.** A pan or zoom writes one `transform` on `world` and one `background-position/size` on `grid`, never layout properties, in a single rAF
  batch. `will-change: transform` on `world` while a gesture is active only (removed after, to avoid a permanent layer).
- **No layout thrash.** Read `getBoundingClientRect` of the root once per gesture start and on a `ResizeObserver` (added in `connected()`, removed in
  `disconnected()`, rule 5); never inside a pointermove. Item rects come from the coordinate contract (numbers), not from measuring the DOM.
- **Thousands of items.** Slot mode is fine to a few thousand light DOM nodes and is the documented ceiling. Beyond it, `items` mode culls with
  `visibleRects` (plus the uniform-grid index above about 5,000 items), mounts only visible items through `renderItem`, and recycles nodes. Selection overlay draws
  only selected items (and a single group box beyond a threshold). Hit testing on pointerdown uses the index, not DOM `elementsFromPoint`.
- **Large zoom ranges.** Coordinates are plain doubles; zoom is clamped so world-to-screen stays within about 1e6 px (past that, browsers drop precision); an
  optional `bounds` keeps the user from panning off to infinity.
- **Budget.** Layer 0 is pure JS and tree-shakes into the element's own file; expected on the order of 3 to 5 KB gzip for `viewport-logic.js` and 3 to 4 KB for
  the element. The existing per-element and page-layer budgets are not raised; if the element is over, features move to the opt-in layers (items mode, guides,
  resize handles) rather than the budget growing. To be measured in step 2.

## Blazor

Follows the standing rules (STANDARDS "Blazor"): `blazor/mappings/canvas.json` maps props to parameters; `Zoom`, `X`/`Y` (or `Viewport`) and `Selection` become
`@bind-` pairs on their commit events; events become `EventCallback`s; the generated `PkCanvas` renders attributes down and events up, with one
`EnsureInitialized` call and no interop per render. Slot mode maps to `ChildContent` (Razor items rendered by Blazor, so Blazor owns them, which is what slot
mode wants). Items mode maps to an `Items` parameter and an `ItemTemplate` `RenderFragment<T>`, which for Blazor is **not** the JS `renderItem` callback: the
component would have to render culled items itself, so items mode is initially JS-only and Blazor uses slot mode plus its own filtering by the `pk-viewport`
event (open question 3). Methods (`ZoomToFitAsync`, `ScreenToWorldAsync`) are explicit interop calls, the way other wrappers expose methods. The coordinate
helpers are also published in the skills (a workflow for "build an editor") since agents will use them directly.

## Review scenarios and browser cases

Per AGENTS.md, layout expectations are measuring cases and states a still example cannot show are scenarios (`core/tests/review/scenarios/`).

Gallery examples (resting): a default canvas with grid and a few slotted SVG rects; dots grid; a read-only canvas; a canvas in a `pk-splitter` pane.

Scenarios (each with screenshots at desktop and phone, light and dark, and `expect(t)` measurements):

- `canvas-zoom-anchor`: wheel-zoom at the pointer, `t` checks the world point under the pointer is unchanged (within 1 px) and the grid line spacing stays in the
  minPx..2x minPx band across ten zoom steps.
- `canvas-pan-keyboard`: focus, arrows, Home/`1` fit; expects the viewport and that focus stays on the canvas.
- `canvas-select-marquee`: marquee over three items, shift-toggle one, handles visible and `t.ringUnclipped`, handle hit areas at least the tap-target minimum on phone.
- `canvas-snap`: drag an item near a guide and another item's edge; expects the snapped rect and a visible snap line, and no snap when the threshold is exceeded.
- `canvas-rtl`: `dir="rtl"`; arrows mirror, the grid and world do not.
- `canvas-reduced-motion`: fit jumps without a transition.
- `canvas-in-splitter`: resizing the pane resizes the canvas, viewport origin kept, `t.within` the pane.

Measuring browser cases (`core/tests/browser/`, written before the CSS): the canvas fills its container at zero and non-zero sizes; `world` transform equals
`transformCss` of the reported viewport; the root has `touch-action: none`; `screenToWorld(worldToScreen(p))` round-trips through the real element; dragging an item
emits `pk-move` with world units, not screen pixels; 2,000 items in items mode mount fewer than a stated number of nodes at zoom 1 (the culling assertion).

Node tests: layer 0 as above; an element test for the meta/API, the event contract and the ownership rule (`writes` is empty: the canvas writes nothing on
slotted children; `ownership.test.mjs` verifies).

## Implementation breakdown

Each step is one issue, one branch, one pull request, about 400 lines or less of hand-written source, leaves `main` releasable, and carries docs, gallery sample,
skill workflow, Blazor mapping and changelog as AGENTS.md requires. #430 stays open until the last step.

1. **Viewport model.** `viewport-logic.js` (transforms, pan, zoom, fit, steps, wheel/pinch normalisation) and its property tests. No element. Independently useful to #431 and to
   tooling. Depends on: nothing.
2. **`pk-canvas` core.** Element with viewport props, grid background, world slot, pan (drag/space/wheel/touch), zoom (wheel/pinch/keys), methods, `pk-viewport`, a11y
   basics, reduced motion, RTL, `zoom-in/out` helpers, gallery sample, Blazor mapping. Depends on: 1. First measurement of size.
3. **Selection layer.** `hitTest`, `marquee`, `combine` in logic; the overlay, click/shift/marquee, `selection` two-way prop, `pk-select`, keyboard select, coordinate contract on children, live-region
   announcements. Depends on: 2.
4. **Move, resize, nudge.** `handles`, `resizeRect`, drag move, nudge keys, `pk-move`/`pk-resize-item` (cancelable), `readonly`. Depends on: 3.
5. **Guides and snapping.** `snapRect` in logic (grid, guide, edge, centre), guide creation by dragging from an edge (or from a `guides` property only), snap-line drawing,
   `snap`/`snap-threshold`. Depends on: 4 (move is what snaps).
6. **Scale: culling and items mode.** `visibleRects`, the uniform index, `items`/`renderItem`, node recycling, the 2,000-item browser case. Depends on: 3. Blazor items mode decision is made here.
7. **Review scenarios and guide.** Any scenarios not added with steps 2 to 5, the "build an editor" skill workflow, a worked example combining `pk-canvas` with `pk-splitter` (a two-pane editor). Depends on: 2 to 5.
8. **Optional: rulers and guides UI, minimap, zoom control (`pk-zoom-control`?).** Only if the owner wants them; each a consumer of the canvas API, not part of it. Depends on: 5.

Steps 3 to 5 can be reordered against 6. Design passes for #431 and #432 are separate, and can start after step 1 lands because they only need the logic module.

## Open questions for the owner

1. **Renderer for the grid and world: DOM/CSS or `<canvas>`?** Proposed: CSS background for the grid and DOM/SVG children for items, which keeps items
   accessible, styleable with tokens and CSP-clean. A 2D/WebGL surface would scale to 100,000 shapes but items stop being elements. Is the target thousands (DOM is enough) or far beyond?
2. **How does the canvas learn item geometry?** (a) a coordinate contract on slotted children (`data-x`, `data-y`, `data-w`, `data-h`, `data-id`) as proposed, (b) measure with
   `getBoundingClientRect` (simple, but layout reads and wrong under transform), (c) only `items` data, no slotted children. Choice affects the whole API.
3. **Slot mode versus `renderItem`/`items` mode, and Blazor for the second.** Ship both, slot mode only first, or `items` only? Blazor cannot supply a JS callback; is JS-only acceptable for items mode?
4. **Viewport as three props (`x`, `y`, `zoom`) or one object (`viewport`)?** Three is attribute-friendly and simple in Razor; one is atomic (one commit per gesture).
5. **Event cadence:** commit `pk-viewport` only when a gesture ends (the STANDARDS "commit" rule) or also stream during a pan for a minimap/ruler? Proposed: `pk-viewport` on commit plus a
   non-committing `pk-viewport-change` per animation frame.
6. **RTL semantics:** confirm world coordinates never mirror (only keyboard direction and the chrome do). A drawing tool that mirrors x under RTL would be surprising for print/laser work.
7. **Plain wheel:** pan, zoom, or pass through to the page? Design tools expect wheel to pan and ctrl+wheel to zoom; a canvas inside a scrolling page must not trap scrolling. Proposed: pan only when focused or `mode="pan"`.
8. **Units:** world units are unitless; do fabrication use cases (#431: mm, inches) want a `unit` prop and rulers in the canvas, or only in the SVG toolkit?
9. **Multi-selection transform** (group rotate, scale from a group box): in scope for step 4, or later? Rotation is not in this design at all.
10. **Undo/redo:** confirm the canvas emits intent only and consumers own history, reusing `history.js` (proposed), rather than shipping an undo helper with the canvas.
11. **Size budget:** what ceiling is acceptable for the first release of an element this size, and may the optional layers (guides, resize handles, items mode) live in a separate loaded-on-demand module, as tools do today?
12. **Naming:** `pk-canvas` (as in #430) or something that does not collide with the HTML `<canvas>` in agent and search vocabulary (`pk-stage`, `pk-viewport`)?
13. **Ordering across #430, #431, #432:** proposed canvas step 1 first, then #431 and #432 design passes in parallel. Any hard dependency on your side (a specific product needing docking first)?
