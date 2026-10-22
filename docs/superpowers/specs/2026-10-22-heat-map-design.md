# pk-heat-map: weighted treemap with status colour (refs #1721)

Status: proposal for owner decision. Docs only; no product code, no budget change. Related: #1656 (separate packages), tracker #336, `pk-chart`, `pk-grid`, `pk-table`.

## 1. Problem

An at-a-glance overview ("issues by area") is a fixed-size area filled with rectangles whose area encodes a magnitude and whose colour encodes status. Apps hand-compute `pk-grid` spans, which cannot tile arbitrary weights, does not stay inside a fixed height, and repeats the responsive handling. `pk-chart` has bar, line, donut, stack and spark only.

## 2. What exists today

- `pk-chart` (tier `element`, pure SVG, slotted data table as the accessible fallback) is the pattern: data in, table fallback, no dependencies.
- `pk-tree` and `pk-list` cover keyboard list semantics; the status colours are tokens (`--color-*`).
- Core npm headroom is about 3 KB packed, so a new layout engine does not fit in `plainkit`. Built extras today: `plainkit.canvas`, `markdown`, `dock`, `ide` (`packages.json`).

## 3. Proposal

### 3.1 Placement: a new extra `plainkit.charts` (Q1)

Put `pk-heat-map` in its own extra, `@plainkit/charts` (Blazor option `charts`), `requires: ["plainkit"]`, registered by tag like the other extras. Reasons: it is data visualisation, `pk-chart` stays small in core, and later layouts (sunburst, calendar heat grid) have a home. Not `canvas` (a design surface, a different audience). Not a module (modules are mounted tools). If the extra mechanism is not ready, build under `core/elements/heat-map/` with the layout maths in `core/js/heat-map-layout.js`, listed in the extra's file list, so the move changes no public name.

### 3.2 Element and tier (Q2)

`pk-heat-map`, tier `element`: renders no `pk-*` (C4). Boxes are `<a>` or `<button>` in the shadow tree, positioned from the layout result by custom properties (`--pk-heat-x/y/w/h`, set through the CSSOM `style.setProperty`, which CSP allows; no `style` attributes in markup). There is no child element: items are data (`items` property, or a slotted `<table>`), the same data-first approach as `pk-chart`.

### 3.3 Props, events, slots

| Prop | Default | Meaning |
| --- | --- | --- |
| `items` | `[]` | `{ id, label, value, severity?, intensity?, href?, children? }`; `value` > 0 sets area |
| `layout` | `squarified` | `squarified` or `rows` (weighted rows, stable order) |
| `scale` | `status` | `status` (neutral, info, success, warning, danger by `severity`) or `intensity` (one hue, 0 to 1) |
| `min-box` | `48` | smallest box side in px; smaller boxes merge into one "Other (n)" box |
| `group-by` | `false` | one level: items with `children` draw as framed areas |
| `max-items` | `0` | 0 = no cap; else top N by value plus "Other" |
| `label`, `value-format` | | accessible name of the region; value formatter (locale aware) |

Height: the host sets `block-size` (default `var(--pk-heat-map-height, 20rem)`); the element fills it and never scrolls. Events (bubbling, composed): `select` `{ id, item }` (click, Enter, Space; items with `href` are real links), `focus-item`. Slot `empty`. Parts `box`, `label`, `value`, `other`. Hooks `--pk-heat-map-gap`, `-radius`, `-height`, `-neutral`, `-text`.

### 3.4 Layout algorithm

Squarified treemap (Bruls, Huizing, van Wijk): sort by value descending, fill the rectangle row by row along the shorter side, adding items while the worst aspect ratio improves. A pure function `layout(items, width, height, { gap, minBox }) -> [{ id, x, y, w, h }]` in `js/heat-map-layout.js`: no DOM, node-testable, deterministic (ties by input index). Recomputed from a `ResizeObserver` (added in `connected()`, removed in `disconnected()`), rounded to whole pixels with the remainder given to the last box so nothing leaves the area. `rows` keeps input order so positions stay stable between refreshes (squarified reshuffles as values change; recommended for live dashboards). Boxes under `min-box` are merged, never dropped; the merged box shows count and sum. Phone: the same layout at the narrower width; many tiny boxes become the top ones plus "Other", which expands into the data table inline.

### 3.5 Colour

Severity maps to the existing status tokens (neutral surface token when healthy); text colour is chosen per token pair so contrast is at least 4.5:1 in light and dark (UI review audit enforces). The intensity scale mixes one token toward the surface with `color-mix`. Colour is never the only carrier: non-neutral boxes show the severity word or an icon and carry it in their name (WCAG 1.4.1).

## 4. Accessibility

- Region `role="group"` with `aria-label`; boxes form a list, each a link (with `href`) or a button. Accessible name: "Billing, 42, Warning". One tab stop for the group, arrow keys move to the nearest box in that direction, Home/End first/last, Enter/Space activate (roving tabindex).
- Data-table fallback: a visually hidden `<table>` (label, value, share, severity) is always in the shadow tree; `show-table` shows it in place of the map (also the print and narrow fallback). Truncated labels keep the full text in the name; the tooltip is the element's own description text (a `pk-tooltip` would be a higher tier).
- Focus ring uses the focus token and stays unclipped inside the area; hover and focus never change layout; `prefers-reduced-motion` turns off value-change transitions.

## 5. Size budget

Layout maths about 0.7 KB gzip, element about 2.5 to 3.2 KB: inside the 4 KB element limit, and outside the core budget when it ships in the extra. The extra gets its own ceiling at first publish, ratcheted down. No dependency.

## 6. Blazor wrapper

`blazor/mappings/heat-map.json`: `Items` (JSON, typed `PkHeatItem` record in a generated partial, as `PkChartData`), `Layout`, `Scale`, `MinBox`, `GroupBy`, `MaxItems`, `Label`, `ValueFormat`; event `OnSelect` (typed id). Generated `PkHeatMap`, no hand-written logic; `[PkRequiresExtra("charts")]` once the split lands. A per-item template waits for generator slot support (or an `extra: true` entry).

## 7. Tests

- Node: layout function (areas proportional within 1 px, boxes tile the rectangle with no overlap or overflow, aspect-ratio bound, tie determinism, min-box merge, zero and negative values rejected with `warnOnce`), data parsing from props and table, mapping, bUnit passthrough.
- Browser cases (measuring): box areas sum to the container minus gaps; no overlap; resize relays out; arrow keys move focus to the geometric neighbour; the hidden table has one row per item; `select` fires once; "Other" merge.
- Scenarios `heat-map-*.js`: 5, 40 and 300 items, one dominant item, phone 375, RTL, dark, focus ring, hover; every screenshot opened in UI review.

## 8. Phases (about 400 lines each)

1. Layout function and tests (about 250), plus extra scaffolding if the mechanism exists.
2. Element: render, scale, a11y, hidden table, meta, gallery, browser cases (about 400).
3. `group-by`, "Other" expansion, scenarios, UI review (about 300).
4. Blazor mapping, bUnit, docs, skill workflow, changelog (about 200).

## 9. Alternatives rejected

- `pk-chart kind="treemap"`: core is full and chart would pass its budget.
- Hand-computed `pk-grid` spans: cannot tile arbitrary weights.
- A treemap library: needless bytes for about 80 lines of well-known maths.
- Canvas drawing: no native links, focus or text; harder a11y.

## 10. Decisions needed

1. **Package:** new extra `@plainkit/charts`, core, or `canvas`? Recommend the new extra (core has about 3 KB; `canvas` is the wrong audience); build under `core/` with the extra's file list until the mechanism lands.
2. **Tier:** `element` (no `pk-*` inside)? Recommend yes; tooltips are native description text.
3. **Default layout:** `squarified` or `rows`? Recommend `squarified` default; document `rows` for live data.
4. **Grouping:** one level in v1 or follow-up? Recommend follow-up (phase 3), flat first.
5. **Item bodies:** data-only in v1, or a custom item slot? Recommend data-only; a slot once the Blazor generator supports per-item templates.
6. **Small boxes:** merge into "Other" or shrink? Recommend merge below `min-box`, always reachable through the table.
7. **Colour scale:** status tokens only, or also intensity? Recommend both, `status` default.
