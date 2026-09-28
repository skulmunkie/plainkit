# SVG toolkit: a pure vector document model, safe import/export, and thin editing elements

Status: design proposal for owner review, not yet planned or implemented. Refs #431 (does not close it). Related: #430 (canvas), #432 (dockable layout), #429 (property grid, shipped), tracker #336.

## Why

#431 asks for first-class SVG creation and manipulation: shapes, grouping, transforms, export, and an advanced tier (path operations, bounding boxes, alignment, offsetting, boolean operations) aimed at fabrication, print, signage, laser and maker workflows. The issue itself says it needs its own design pass; this is that pass.

Two facts shape the design:

1. **The SDK already has the right patterns, just not for vectors.** `core/js/layout-model.js` is a pure, DOM-free, node-testable document model with pure edit operations, a `createHistory` undo stack (with key-coalescing), `LIMITS`, and a sanitising `fromHtml` that always returns a valid document plus a `problems` list. `core/js/layout-builder-logic.js` is the thin logic layer over it, and `core/modules/layout-builder` is the UI. `core/elements/chart/chart.js` already builds SVG with DOM calls only (`SVG_NS`, an element factory, no `innerHTML`). `core/js/zip-store.js` and the `createObjectURL` download idiom (`theme-editor/sdk-tab.js`) cover export. The SVG toolkit is the same shape applied to a different document type.
2. **The owner philosophy is to write little code and layer.** So the deliverable is mostly one pure model plus a serializer/sanitiser, then very thin elements whose UI is composed from existing controls (`pk-property-grid`, `pk-toolbar`, `pk-tree`, `pk-splitter`, `pk-button`, `pk-colour-input`, `pk-unit-input`). The one part that is genuinely new and large, geometry for paths and booleans, is isolated and deferred behind a build-vs-adopt decision.

## Non-goals

- Not a general graphics engine, not a raster editor, no filters, blend modes, gradients editor, masks, clipping paths or animation in the first releases (listed under "later").
- Not a full SVG 1.1/2 implementation. The toolkit edits and exports a **strict, allow-listed subset** (see "Safe SVG").
- No new pan/zoom/grid/snapping surface: that is `<pk-canvas>` (#430). This toolkit is the document and the tools on top of it.
- No dockable layout of its own: panels use `pk-splitter`, `pk-workspace` and whatever #432 delivers.
- No third-party dependency in core (see the path/boolean discussion for the one place this is contested).
- Not an SVG *renderer* for arbitrary untrusted files: import sanitises to the subset and drops the rest, reporting what was dropped.
- No implementation in this pull request.

## Assumed canvas contract (#430 has not landed)

At the time of writing there is no canvas spec on `main` and no `docs/430-*` branch on the remote. This design therefore **assumes**, and asks the canvas spec to confirm, the minimum below; if the canvas spec differs, only the "canvas adapter" step (step 7) changes, because the document model never touches the canvas.

- `<pk-canvas>` owns the viewport: a pan/zoom **view transform** (a 2D matrix, world to screen), a background grid, guides, and snapping (it exposes `snap(point, { exclude })` returning a snapped world point plus the guide that snapped).
- It exposes a coordinate API: `toWorld(clientX, clientY)`, `toScreen(x, y)`, and a `viewbox` (world rect currently visible).
- It renders **content the host gives it** into a world-space layer (a slot for an `<svg>` group); it does not know what the content means.
- It owns pointer/wheel/keyboard for *navigation* (pan, zoom, space-drag), and emits `pk-canvas-pointer` style events in **world coordinates** (down/move/up with modifiers) for tools to consume. Selection *rectangles* (marquee) are drawn by the canvas, selection *semantics* are the host's.
- It has no idea about shapes, ids or undo.

The toolkit layers on that: tools convert canvas pointer events into pure model operations; the model's render output goes into the canvas layer; canvas snapping is fed shape geometry (bounds, centres, edges) by a pure `snapTargets(doc)` function from the model. Nothing is duplicated: view transform, grid, guides, snapping and pan/zoom are all the canvas's.

## Design

Four layers, bottom-up. Each layer depends only on the ones below, and only the top one touches the DOM.

```
Layer 4  elements:  pk-svg-editor (composition), pk-svg-toolbox, pk-svg-layers, pk-svg-inspector   (thin; DOM)
Layer 3  render + io: svg-render.js (model -> DOM via factory), svg-io.js (toSvg, fromSvg, sanitise)   (pure except render)
Layer 2  ops:  svg-ops.js (create, group, transform, align, distribute, order), svg-path.js, svg-boolean.js  (pure)
Layer 1  model: svg-model.js (document tree, ids, matrices, bounds, selection, history reuse)               (pure)
```

### Layer 1: the document model (`core/js/svg-model.js`, pure)

Mirrors `layout-model.js`: no DOM, no logging, no side effects; everything returns data. Node-unit-testable, usable from Blazor, a build script or a worker.

A document is `{ version, seq, width, height, units, title, desc, root }`. A node is `{ id, type, attrs, children? }` with ids `"s<number>"` from `seq`, never reused (same rule as the layout model). Node types are a closed set:

| type | attrs (all numbers are finite, clamped by `LIMITS`) |
| --- | --- |
| `rect` | x, y, width, height, rx, ry |
| `ellipse` (and circle as a special case) | cx, cy, rx, ry |
| `line` | x1, y1, x2, y2 |
| `polyline`, `polygon` | points (array of `[x, y]`, stored as numbers, serialised to a string) |
| `path` | d (stored **parsed**: an array of absolute segments, see Layer 2) |
| `text` | x, y, text (plain string), fontSize, fontFamily from an allow-list |
| `g` | children |
| all | transform (a 6-number matrix `[a,b,c,d,e,f]`, never a string), fill, stroke, strokeWidth, opacity, name (user label), title/desc (accessibility text) |

Key decisions:

- **Transforms are matrices in the model**, always. The `transform` attribute string is produced only on export (and may be decomposed to `translate/rotate/scale` when it is exactly that, for readable output). Parsing an incoming transform list composes to one matrix; unsupported functions (`skewX` is supported; anything malformed) are dropped with a problem. Pure helpers: `multiply`, `invert`, `apply(point)`, `decompose`, `fromTranslate/Rotate/Scale`.
- **Bounds are computed, not stored:** `bounds(node, { world })` returns a rect for every type (path bounds use exact curve extrema, not control points), and `bounds` of a group is the union of children through their matrices. The oriented box for a rotated shape is available too (`obb`), because alignment on a rotated shape needs a choice (see open questions).
- **Selection is data**: `{ ids: [], primary }`, with pure helpers that keep it valid after edits (like `selectionAfterRemove` in `layout-builder-logic.js`). Selection lives beside the document, not in it, so it is not undone as content.
- **Undo/redo reuses `createHistory`** from `layout-model.js` unchanged (present/past/future, `push(next, key)` with coalescing so a drag is one undo step, `limit`). It should be moved to (or re-exported from) a tiny shared `core/js/history-stack.js` in step 1 so the SVG model does not import the layout model; the layout model then re-exports it. That is the only refactor of existing code.
- **Structural sharing**: operations return a new document sharing untouched nodes, so history holds references, not deep copies (the layout model's approach), which keeps undo cheap at thousands of shapes.
- **Limits** in one `LIMITS` object in the layout model's style: nodes (5,000), depth (16), path segments per path (10,000), total path points, string length, absolute coordinate magnitude (for example 1e6), input bytes (2 MB), applied at every entry point (create, import, deserialise).
- **Guarantees, property-tested** like the layout model: `fromJson(toJson(doc))` equals `doc`; `fromSvg(toSvg(doc))` is a fixed point after one round; `fromSvg` returns a valid document for *any* input string and never throws; every op preserves ids' uniqueness and the limits.

### Layer 2: operations (`core/js/svg-ops.js`, `svg-path.js`, `svg-boolean.js`, pure)

**Tier A: document ops (small, exact, no numerical risk).** `create(shapeSpec)`, `remove`, `duplicate`, `group` / `ungroup` (ungroup bakes the group's matrix into children), `reparent`, `order` (front/back/forward/backward), `transformSelection(matrix, { about })`, `translate/rotate/scale/flip`, `setAttrs` (with `key` for history coalescing). **Alignment and distribution** (left, centre, right, top, middle, bottom; distribute by edges or centres; equal spacing) are a few dozen lines over `bounds`: pure `alignPlan(doc, ids, { axis, to: 'selection'|'first'|'parent' }) -> [{ id, dx, dy }]`, then applied as translates. Shape generators (`star`, `polygon(n)`, `roundedRect`, `arc`, `grid`) are pure functions returning path or polygon nodes, in the spirit of `barRects`/`donut` geometry already in `chart.js`.

**Tier B: path operations.** `svg-path.js`: parse the `d` grammar (all commands, relative and implicit repeats, arcs) to a normalised absolute segment array `M/L/C/Z` (quadratics elevated to cubics, arcs converted to cubics); `toD` (with configurable rounding for export size); `bounds`; `length` and `pointAt`; `reverse`; `transform(matrix)`; `simplify` (Ramer-Douglas-Peucker on flattened data); `flatten(tolerance)` to polylines. These are well understood and moderate: roughly 300-400 lines total, in two or three pull requests.

**Tier C, the risky part: offsetting and boolean operations** (union, subtract, intersect, exclude, plus stroke-to-path and inset/outset). This is the only place the feature stops being "bookkeeping" and becomes computational geometry: curve/curve intersection, self-intersection, degenerate and coincident edges, fill rules, winding, floating-point robustness. Bugs here corrupt someone's laser-cut file, and failures are subtle, not loud.

Build-vs-adopt, given the no-runtime-dependencies rule:

| Option | What it is | For | Against |
| --- | --- | --- | --- |
| A. Do not ship in core; ship the seam only | Core defines the *interface* `booleanOp(op, pathsA, pathsB, { fillRule, tolerance }) -> paths` and the UI/undo/selection plumbing; a host supplies the implementation through a registered provider (`setGeometryProvider`) | Zero dependency, zero numerical liability in core; a host can plug in a vetted library (Clipper-family for polygons, paper.js-style for curves) or a WASM build; UI is fully testable with a fake provider | Feature is off by default; a consumer must add a package; two-step story |
| B. Polygon-only in-house | Flatten curves to polylines at a tolerance, run a well-known polygon clipping algorithm (Greiner-Hormann / Vatti / Martinez-Rueda-style sweep) implemented in core, emit polylines (optionally re-fit to curves) | No dependency, deterministic, node-testable against fixtures; adequate for many maker workflows (results are polylines, which laser cutters accept) | Real cost (a sweep-line clipper with robust degenerate handling is several hundred lines and needs a large fixture suite); output loses true curves; still the riskiest code in the SDK |
| C. Vendor a library into the repo | Copy an MIT/BSD-licensed clipper/offsetter in as source under `core/vendor/` with its licence | Battle-tested; exact-integer robustness (Clipper's scaled-integer approach) | The SDK's "no dependencies" principle, the size budgets (a clipper is 30-60 KB of source, gzip 8-15 KB), licence and provenance obligations, security review of code we did not write, and the privacy/`security.allow` scans |
| D. Optional separate package | Same as C but shipped as its own opt-in add-on (`plainkit-svg-geometry`), loaded lazily, never in core budgets | Keeps core clean, allows the strong library, budgets are separate | Second artefact to version, test, document, and release (a release-process decision for the owner) |

**Recommendation:** ship Tier A and Tier B in core, and ship Tier C as **option A now** (the provider seam, with the UI and the operations plumbing tested against a fake provider), then **decide between B and D with evidence** after the first releases: measure how many real workflows need curve-preserving booleans versus polyline results. Rationale: the seam costs almost nothing, is honest about the risk, and does not paint us into a corner; an in-house clipper (B) is the only option that fully satisfies "no dependencies" and "in core", but it should be a deliberate, separately reviewed step with a fixture-based test corpus (touching squares, coincident edges, holes, self-intersections, tiny slivers), not a side effect. Offsetting/stroke-to-path follows the same seam. This is open question 1.

### Layer 3: safe SVG in and out (`core/js/svg-io.js`, `svg-render.js`)

**One allow-list, two directions.** A single frozen table `ALLOWED = { element: [attributes] }` drives both the exporter and the importer, so they cannot drift (same idea as `NATIVE` in `layout-model.js`):

- Elements: `svg, g, rect, ellipse, circle, line, polyline, polygon, path, text, tspan, title, desc, defs` (defs only for later gradients), nothing else in the first releases.
- Attributes: geometry attributes per element, `transform`, `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-dasharray`, `opacity`, `fill-rule`, `id`, `class` (limited to a token pattern), `role`, `aria-label`, `aria-hidden`, `viewBox`, `width`, `height`, `xmlns`, `font-size`, `font-family` (allow-listed families), `text-anchor`.
- Values: numbers are finite and bounded; colours match a strict grammar (hex, `rgb()`, `hsl()`, named-colour list, `none`, `currentColor`, or a `var(--color-...)` token reference for in-app use); a `url(#id)` is allowed only for an id inside the same document. **No** `href`/`xlink:href` at all in the first releases (that removes external references and `javascript:` in one rule; images are a later, separately reviewed step reusing `core/js/safe-url.js`).
- Never allowed, and reported when seen: `script`, `foreignObject`, `style` elements, `style` attributes, every `on*` handler, `use` with external targets, `image`, `animate*`/`set`, `a`, `iframe`, `link`, entity declarations or `DOCTYPE`, processing instructions, CDATA sections, any namespace other than SVG.

**Importer (`fromSvg(text, { limits }) -> { doc, problems }`):** parses **without executing or attaching anything**: `DOMParser` with `image/svg+xml` in a detached document in the browser; for node tests a tiny tokenising parser (or the same code path over a passed-in parser, as other `*-logic.js` modules take their DOM as a parameter). It walks the parsed tree once, copying **only** allow-listed elements/attributes/values into the model; everything else becomes a `problem` (`{ code, severity, message, path }`, the layout model's shape) and is dropped. Result: `fromSvg` always returns a valid document with no errors, whatever the input, exactly the layout model's guarantee. Size and depth limits are checked **before** parsing (byte length) and during the walk (nodes, depth, path segments), so a hostile file costs bounded time (billion-laughs is impossible because DTDs are refused before parsing).

**Exporter (`toSvg(doc, { compact, precision, title, desc, standalone }) -> string`):** writes from the model, never from the live DOM, using string building with **every dynamic value escaped** through one `esc()` (as gallery code already does), and only allow-listed names. Outputs `viewBox` and explicit `width/height` with units (`mm` and `in` matter for fabrication: this is the reason `units` is in the document), `<title>`/`<desc>`, `role="img"` on the root, per-shape `<title>` when a shape has alt text, and stable ids. Numbers are rounded to a configurable precision (default 3 decimals) for size and determinism (byte-identical output for equal input, testable). Also `toDataUri` and a `download(doc, name)` wrapper in the module layer using the existing Blob idiom (not in the pure model). PNG export is a canvas rasterisation done at the element layer, and is optional (step 9).

**Renderer (`svg-render.js`):** `render(doc, make)` builds the DOM through a factory, like `buildChart(..., make)` in `chart.js`: `createElementNS` and `setAttribute` only, with `textContent` for text; **no `innerHTML`, no new sink**, so `security.allow.json` needs no new entry. CSP: nothing inline; colours and sizes are attributes on SVG elements (allowed under `style-src 'self'` because they are attributes, not `style`), and editing chrome (handles, selection box) is styled by class in the element's stylesheet with tokens. Incremental patching (`patch(prevDoc, nextDoc)`) keys on ids so a drag updates one node, not the tree.

**Icons:** the icon pipeline (`core/icons/build.mjs`) lints bare `<svg viewBox="0 0 24 24">` sources with a regex and a byte budget. A later, optional step reuses the toolkit's importer to **replace that hand-written lint with the shared allow-list** (one place that says what SVG is acceptable) and to power an "import to icon" workflow; it is deliberately not part of the first steps, and nothing in the toolkit depends on it.

### Layer 4: elements (thin, composed, `pk-svg-*`)

Each element is a small shadow-DOM shell over the layers below, following `core/STANDARDS.md` "Ownership and reactivity": the host owns attributes and light-DOM children; the element owns its shadow tree; subscriptions outside its subtree (window `keydown` for tool shortcuts, the canvas instance) are added in `connected()` and removed in `disconnected()`; no new base-class hooks; every callback and business logic is a property, never an attribute; logging through `this.log`/`this.warnOnce`, no silent `catch`.

| Element | What it is | Built from |
| --- | --- | --- |
| `pk-svg-toolbox` | Tool buttons (select, rect, ellipse, line, polyline, path, text) and actions (group, ungroup, align, order, undo, redo, export) as a roving-tabindex toolbar; emits `pk-svg-tool` / `pk-svg-action` | `pk-toolbar`, `pk-button-group`, `pk-button` with `icon-name`, `pk-tooltip`, `pk-menu-item` for align/distribute menus |
| `pk-svg-layers` | The tree of shapes with visibility/lock toggles, rename, drag reorder, multi-select | `pk-tree` / `pk-tree-item` (already keyboard-complete), `pk-sortable` for reorder |
| `pk-svg-inspector` | Properties of the selection: position/size (`pk-unit-input` for mm/in/px), rotation, fill and stroke (`pk-colour-input`), stroke width, opacity, name, alt text | **`pk-property-grid` (#429)** driven by `config.groups` generated by a pure `inspectorConfig(doc, selection)`; edits arrive as `pk-property-change` and become `setAttrs` ops. Mixed values across a multi-selection show as "mixed" (a `values` convention to agree with the property grid) |
| `pk-svg-editor` | The composed tool: toolbox + canvas + layers + inspector, in a `pk-workspace`/`pk-splitter` arrangement (later #432 docking); owns the model, history and selection; the *only* element with state | the four above plus `<pk-canvas>` |
| `pk-svg-view` (optional, tiny) | Read-only display of a sanitised document (for previews and galleries), the safest way to show user-supplied SVG | `svg-render.js` only |

Application wiring stays in the layout builder's style: `svg-editor-logic.js` (pure controller: pointer event in world coordinates + current tool -> op, drag-in-progress state, snapping targets, keyboard command table) is node-tested, and the element is a thin adapter. A **module** (`core/modules/svg-editor`, `defineModule`) can later package the editor as a route in an app, as `layout-builder` does, for the "drawing tool" use case; this is not needed for the SDK primitive.

### Public API sketch

```js
import { createSvgDoc, ops, alignPlan, toSvg, fromSvg, createHistory } from 'plainkit/svg-model.js';

let doc = createSvgDoc({ width: 200, height: 100, units: 'mm', title: 'Sign' });
({ doc } = ops.create(doc, { type: 'rect', attrs: { x: 10, y: 10, width: 40, height: 20, fill: '#0a0' } }));
doc = ops.transform(doc, ['s2'], rotate(45, { about: 'center' }));
doc = ops.align(doc, ['s2', 's3'], { axis: 'x', to: 'left' });
const svg = toSvg(doc, { precision: 3 });                 // safe, deterministic string
const { doc: imported, problems } = fromSvg(text);        // sanitised; problems lists what was dropped
```

```html
<pk-svg-editor id="ed" units="mm" width="200" height="100"></pk-svg-editor>
<script type="module">
  ed.doc = fromSvg(saved).doc;                             // property: a document, never an attribute
  ed.addEventListener('pk-svg-change', e => save(toSvg(e.detail.doc)));   // detail: { doc, reason }
  ed.geometry = myBooleanProvider;                         // optional (Tier C seam)
</script>
```

Events: `pk-svg-change` (`{ doc, reason }`, coalesced per gesture), `pk-svg-select` (`{ ids }`), `pk-svg-tool` (`{ tool }`), `pk-svg-problems` (`{ problems }` after an import). Props: `doc` (property), `tool`, `units`, `readonly` (reflected), `geometry` (property).

### Accessibility

A vector editor is inherently spatial, so the commitment is **equivalent operability by keyboard and text alternatives**, not pixel dragging by keyboard alone.

- **Every operation has a keyboard path.** Layers panel: tree keyboard model (arrows, Home/End, type-ahead, Enter to rename), multi-select with Shift+arrows/Space. Canvas: the selection can be moved with arrow keys (1 unit; Shift = 10; Alt = grid step), resized with Ctrl+arrows, rotated with `[` and `]`, deleted, duplicated, grouped (Ctrl+G), ordered; Tab enters and leaves the canvas as one stop (roving inside) so it never traps focus. Creating a shape without a pointer: pick a tool, press Enter on the canvas, and a default-size shape is placed at the view centre and selected; the inspector's position/size fields then set exact values. Path nodes are edited by Tab/arrow through nodes and moving with the same arrow keys.
- **Announcements.** A polite live region (the `pk-toast`/`notify.js` pattern, not a new mechanism) announces selection changes ("Rectangle 'Door', 40 by 20 mm, at 10, 10. 2 of 5"), operation results ("Grouped 3 shapes", "Aligned left", "Undone: move"), and import problems ("2 elements removed: script, foreignObject"). Announcements are coalesced and throttled during arrow-key repeats.
- **Tab order:** toolbox, layers, canvas (one stop), inspector; the order is DOM order, so docking rearrangements keep it meaningful.
- **Names and roles:** the drawing area is `role="application"` **only** when the canvas is in editing mode, with an accessible name and a described-by pointing at a keyboard-help element; otherwise it is a `role="img"` with the document `title`/`desc`. Tool buttons expose `aria-pressed`. Focus rings and handle contrast use tokens and are covered by the scenarios below (tap targets of 24 px minimum for handles at phone size, with a larger hit area than the drawn handle).
- **Exported SVG accessibility.** `toSvg` writes `role="img"`, `<title>` and `<desc>` on the root (the document's title/description, required by a prompt in the inspector before export when empty, with a warning problem otherwise), `aria-labelledby` linking them, per-shape `<title>` when alt text is set, `aria-hidden="true"` for shapes marked decorative, and reading order equal to document order. `lang` is set when known.
- **Motion and colour.** No animation is required; hover/selection styles never rely on colour alone (handles have shape); the audit already in `ui-review` (contrast, tap targets, names) applies.

### Performance

- The model is cheap: structural sharing, matrices as 6-tuples, lazily memoised bounds keyed by node identity (a `WeakMap`, invalidated by identity change, so no manual invalidation).
- Rendering patches by id, and a **drag is a preview transform on one `<g>`** applied directly to the DOM and committed to the model once on pointer-up (one history entry), so a 5,000-shape document drags at frame rate. Selection overlays are drawn in a single overlay layer, not per shape.
- Hit testing: for the pure model, an id-keyed bounds index (a uniform grid or a simple sorted-axis index) built lazily and rebuilt on structural change; precise hit tests (point in fill/stroke) use `SVGGeometryElement.isPointInFill/Stroke` in the browser or pure `flatten` in tests.
- Limits (nodes, segments) are enforced up front, and `simplify`/`flatten` accept a tolerance so a heavy path can be lightened. Long operations (boolean on large inputs, simplify on 100k points) run in chunks or in a worker through the provider seam; the model itself never blocks.
- Budgets to hold: creating 1,000 shapes under 50 ms in node; a pointer-move drag step under 4 ms at 2,000 shapes; import of a 1 MB file under 300 ms (measured in `core/modules/performance`-style cases, reported not asserted where machine dependent).

### Blazor mapping

The SDK and Blazor change together (`AGENTS.md`). For each element an `blazor/mappings/svg-*.json` is added in the same pull request as the element (the generator produces the wrapper, as for `property-grid.json`). The document is exchanged as **a JSON string or the SVG text** (`Doc` as `string`, parsed by the same `fromSvg` in the browser), never as a .NET object graph, so the C# side needs no second implementation of the model and the sanitiser has exactly one source of truth. C# gets: `Doc` (SVG string), `Tool`, `Units`, `ReadOnly`, `OnChange` (payload: SVG string plus reason), `OnSelect`, `OnProblems`, and an `ExportAsync()` returning the SVG text. Server-side safety is a second check, not the first: a consumer storing user SVG server-side should re-sanitise; the docs say so and the model's allow-list is published as data (`core/dist/svg-allowlist.json`, generated) so a server can reuse it. Pure logic modules are exercised by node tests; the Blazor build is tested by the existing `dotnet test` mapping tests.

### Skills, docs and gallery

Per the definition of done: each step adds gallery samples (an editor with a seeded sign, a read-only `pk-svg-view`, an import/sanitise demo showing the problem list), the docs page for the model API, and the skills' workflows in `scripts/skills/` (a "draw and export safe SVG" workflow, and the rule "never inject user SVG with `innerHTML`; use `fromSvg` + `pk-svg-view`"). Changelog fragments are added per step (`added`).

### Review scenarios and measuring browser cases

Every layout expectation is a measuring case (`core/tests/browser/`), and states a still example cannot show are scenarios (`core/tests/review/scenarios/`). Proposed:

Scenarios (each with light/dark, desktop/phone shots and `expect(t)` measurements):

- `svg-editor-layout`: toolbox, canvas, layers, inspector at 1280 and 375 (panels collapse into a drawer/tabs at phone width); `t.noOverlap`, `t.within`.
- `svg-editor-selection`: select a rotated rect; handles present, `t.ringUnclipped`, handles at least 24 px hit size at phone; multi-select box encloses all members (`t.within`).
- `svg-editor-keyboard`: focus canvas, create shape by keyboard, arrow-move, group, undo; focus ring visible; live region text read back by the scenario.
- `svg-inspector-mixed`: multi-selection with differing fills shows "mixed" state without overflow.
- `svg-import-problems`: importing a hostile file lists dropped elements without layout breakage.
- `svg-editor-rtl`: toolbar and layers mirrored; canvas content is **not** mirrored (documents are direction-independent).

Browser cases (rect comparisons, not sentences): align-left leaves every selected bounds `x` equal in the rendered DOM (`getBBox` versus model); distribute gives equal gaps within 0.01; the exported string re-imports to the same rendered `getBBox`; a group's `getBBox` equals the union of its children through their matrices; a 2,000-shape document keeps a drag step below the budget; the sanitised view of the hostile fixture contains no script/foreignObject/handler nodes (`querySelector` counts).

Node tests: matrices (identity, inverse, composition, decompose round-trip), bounds (rect, rotated, arc-to-cubic, group union), path parse/serialise round-trips, `fromSvg` on a hostile corpus (scripts, handlers, `javascript:` hrefs, DTD, oversized, deeply nested, huge coordinates, malformed numbers) asserting an empty error list and no forbidden tokens in `toSvg` output, fixed-point and property tests as in the layout model, alignment/distribution plans, history coalescing.

### Size budget expectations

The page layer's 10 KB gzip and per-element budgets are **never raised**; the toolkit must fit by being loaded lazily, not by bigger budgets.

- The model, ops, path and io are **not** in the page layer: they are ES modules imported only by the SVG elements and the module (the editor is an opt-in route, like the layout builder). Expected gzip (estimates, to be measured at each step): model+matrix+bounds 3-4 KB; ops+align 2 KB; path parse/serialise/flatten 3-4 KB; io (allow-list, importer, exporter) 3-4 KB; render 1-2 KB; each thin element 1-2 KB. A full editor is therefore roughly 15-20 KB gzip loaded on demand, and `pk-svg-view` alone about 5-6 KB (model subset + render + io) since it does not need ops or the tools.
- Tier C, if built in core (option B), is another 6-10 KB gzip and must be a separate lazily loaded module; option A/D adds nothing to core.
- Each step reports its measured size in its pull request; if a step cannot fit an element's own budget, the source is made smaller, not the budget bigger.

## Implementation breakdown

Each step is one issue, one branch, one pull request of about 400 lines of hand-written source or fewer, leaves `main` releasable, and carries its tests, docs, gallery/skill updates and changelog fragment. Generated files do not count.

| # | Step | Depends on | Notes |
| --- | --- | --- | --- |
| 1 | `history-stack.js` extracted from `layout-model.js` (re-exported, behaviour unchanged) + `svg-model.js` core: document, node types, ids, limits, JSON round-trip, matrices | none | Refactor is tiny and covered by existing layout tests |
| 2 | Bounds (all types incl. groups, world/oriented) + selection helpers | 1 | Path bounds arrive with step 5; until then a `path` uses control-point bounds flagged `approx` |
| 3 | Tier A ops: create/remove/duplicate/group/ungroup/reorder/transform/setAttrs + shape generators | 1, 2 | |
| 4 | Alignment and distribution plans, `snapTargets(doc)` for the canvas | 2, 3 | Pure, small |
| 5 | Path parse/serialise/normalise/bounds/flatten/simplify (`svg-path.js`) | 1 | Can run parallel to 3-4; may split into two PRs |
| 6 | Safe I/O: allow-list, `toSvg`, `fromSvg` + hostile corpus tests, `svg-allowlist.json` generated | 1 (5 for path `d`) | Highest security scrutiny; gets its own review |
| 7 | `svg-render.js` + `pk-svg-view` (read-only element) + Blazor mapping | 6 | First user-visible release: safe display of user SVG |
| 8 | `svg-editor-logic.js` (tool state machine, drag, keyboard table, canvas adapter) | 3, 4, canvas (#430) | Blocked on the canvas contract |
| 9 | `pk-svg-toolbox` and `pk-svg-layers` | 8 | Toolbar + tree composition |
| 10 | `pk-svg-inspector` via `pk-property-grid` (`inspectorConfig`, mixed values) | 8, #429 | Small |
| 11 | `pk-svg-editor` composition, live region, keyboard help, scenarios + browser cases | 8-10 | Integration; may split layout vs a11y |
| 12 | Export UI: download SVG, copy, units/precision, optional PNG | 6, 11 | Blob idiom already in repo |
| 13 | Tier C seam: `setGeometryProvider`, boolean/offset commands in ops + UI with a fake provider | 3, 11 | Interface only |
| 14 | Decision-gated: in-house polygon clipper (option B) **or** the add-on package (D) | 13, owner decision | Own design note first |
| 15 | Later, each its own issue: gradients/defs, `image` with `safe-url`, clipping, the icon pipeline reusing the allow-list, module `svg-editor` | 6, 11 | Not committed by this spec |

Steps 1-7 deliver value without the canvas: a tested model, a safe importer/exporter and a safe viewer. That is the recommended first release, and it also gives immediate use to anyone rendering user-supplied SVG.

## Open questions for the owner

1. **Boolean and offset operations (Tier C):** recommended path is the provider seam now, then decide between an in-house polygon clipper in core (B) and an opt-in add-on package (D). Is "no dependencies" absolute for an opt-in add-on package, and is a curve-flattening (polyline) result acceptable for booleans in the first version?
2. **Canvas contract:** are the assumptions in "Assumed canvas contract" right (canvas owns view transform, grid, guides, snapping and emits world-coordinate pointer events; toolkit supplies snap targets)? The canvas spec should confirm or correct them before step 8.
3. **Scope of the first release:** OK to ship steps 1-7 (model, safe I/O, safe read-only `pk-svg-view`) before the canvas and editor exist?
4. **Allow-list strictness:** are you comfortable with no `href`/`image`/`use`/`style`/gradients in the first releases, and `currentColor`/`var(--color-*)` colours allowed? Should imported files with dropped content be blocked, or imported with a problem list (proposed)?
5. **Units and fabrication:** is millimetre/inch-first output (explicit `width`/`height` with units, the reason for `units` in the document) the right default over pixel-first? Do we need DXF/PDF export for laser and print workflows, or is SVG enough (proposed: SVG only, others out of scope)?
6. **Rotated alignment:** align by axis-aligned world bounds (proposed, simple) or by oriented boxes?
7. **Shared history refactor:** OK to extract `createHistory` into a shared module in step 1 (touches `layout-model.js`, with unchanged behaviour), or copy it to avoid touching the layout builder?
8. **Packaging:** ES modules imported by the elements (proposed, lazily loaded) versus registering the editor as a `defineModule` route by default; and where the public import path lives (`plainkit/svg-model.js`?).
9. **Docking (#432):** is the editor allowed to ship in a fixed `pk-workspace` arrangement first and adopt docking when #432 lands?
10. **Property grid additions:** OK to add a "mixed value" display and pk-unit-input as a field type to `pk-property-grid` (a small, separate #429 follow-up), rather than the inspector working around it?
