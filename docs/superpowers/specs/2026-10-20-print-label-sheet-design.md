# Print: a label and card sheet primitive (refs #1674)

Status: proposal for owner decision. Docs only; no product code, no budget change. Related: #1024 (print page, shipped as `pk-print-page`), #1656 (separate packages), tracker #336.

## 1. Problem

Pages that print labels or cards (barcode labels on a 4x6 sheet, bin labels, entry cards) each hand-build a flex/grid of fixed-size cells with page-break rules; D9 flags it and one app carries three stylesheets for it. Needs: a cell size in physical units, a gap, cells per row, no cell split across a page, shell chrome hidden when printing.

## 2. What exists today

- `pk-print-page` (`core/pages/print-page`, tier page): on screen a paper-like sheet under a toolbar; in print it hides the toolbar, `data-screen-only` and the app shell chrome, sets `@page size/margin` from props (`size`, `margin`) through a constructed stylesheet, and keeps `pk-card`, `pk-field-list`, `pk-property-grid`, `pk-field-group`, `figure` whole. `pk-table` keeps whole rows and repeats its header. It owns `@page`; nothing owns repeated fixed-size cells.
- `core/elements/table/table.css` has the only `break-inside: avoid` in an element today. `pk-grid` lays out by `min` width (fluid), the opposite of physical geometry.
- No element sets `mm`/`in` geometry; tokens are rem-based (screen). Print units are a distinct need.

## 3. Proposal

### 3.1 `pk-label-sheet` (tier `element`, see Q2)

A CSS grid of fixed physical cells; each light-DOM child is one cell (a `pk-card`, a `div` with an SVG barcode). The host owns the children (STANDARDS ownership); the element renders a slot and a grid.

Props (reflected; lengths validated like `pk-print-page` validates `size`: digits, dot and `mm|cm|in|pt|px` only, else default plus `warnOnce`):

| Prop | Default | Meaning |
| --- | --- | --- |
| `cell-width`, `cell-height` | `50mm`, `25mm` | the cell box |
| `columns` | `0` | cells per row; 0 = as many as fit the width |
| `gap` | `0` | gap in physical units |
| `offset-x`, `offset-y` | `0` | sheet origin inside the page, for pre-cut stock |
| `outline` | `false` | dashed cut guides on screen and in print |
| `preview` | `true` | on screen, cells at true scale (1mm = 96/25.4 px) on a paper-like surface, scrollable on a phone |

Hooks: `--pk-label-sheet-cell-width`, `-cell-height`, `-gap`, `-pad`. Cells are slotted, so the element styles `::slotted(*)`: `box-sizing: border-box; inline-size/block-size` from the cell hooks; `overflow: clip; break-inside: avoid; page-break-inside: avoid`. Grid: `grid-template-columns: repeat(<columns or auto-fill>, cell-width)`. Rows that do not fit move to the next page between rows, never inside a cell. `print-color-adjust: exact` so barcodes and fills print.

Chrome hiding stays with `pk-print-page` (one owner of print chrome); the sheet is documented as used inside it, whose `size`/`margin` define the sheet. A child larger than its cell is clipped and flagged `data-clipped`. A `warnOnce` when columns, cell width and gaps exceed the container width.

### 3.2 Blazor

`blazor/mappings/label-sheet.json`: `CellWidth`, `CellHeight`, `Columns`, `Gap`, `OffsetX`, `OffsetY`, `Outline`, `Preview`, child content. Generated 1:1 as `PkLabelSheet`, no hand-written code. Docs sample generates N cells from a list with `@foreach`.

### 3.3 Stock templates

A docs table (4x6, A4 30-up, ...) with the prop values, not presets in code.

## 4. Where it lives and budget

- New lazy element `core/elements/label-sheet/` (tier element: base HTML only, C4), loaded by tag, estimated 0.7 KB gzip (CSS about 0.4, JS about 0.3) against the 4 KB element limit. The page layer (10 KB gzip, hard cap, never raised) and the static-score baseline are untouched; phase 1 confirms with `scorecard-sweep`.
- Small and not rare enough for a separate package (#1656 targets canvas, SVG, dock, markdown); stays in core. If a "print" extra is later made holding `pk-print-page` and this, tag and API do not change (lockstep, loader by tag).
- Metadata plus skill text about 2.5 KB packed against the package ceiling, which is not raised; offset by the #1656 dead-weight move or trimmed before merge.
- Tokens only for non-geometric values (`--color-border` for outline); physical lengths come from props.

## 5. Alternatives rejected

- `mm` units in `pk-grid`: grid is fluid by design; mixing physical geometry overloads its contract.
- Cells as props of `pk-print-page`: it is a single-document wrapper; repeated cells are a different job and useful off-page (preview).
- Generating cells from data inside the element (`items` plus template): needs templates and breaks ownership; host or Blazor `@foreach` owns children.
- A barcode/QR drawing component: separate gap (file in #336 if wanted).
- Canvas or SVG-only output: loses accessible text and font control.

## 6. Test plan

Browser cases (measuring; print-media emulation where the harness allows, else screen scale):
- cell rect equals `cell-width` x `cell-height` within 0.5 px for `mm`, `in`, `pt`;
- `columns=3`: three cells share a row (equal `top`), the fourth starts a new row; measured distance equals `gap`;
- `columns=0` fits `floor((W+gap)/(cell+gap))`;
- `break-inside: avoid` computed on every cell; with a print-emulated page height no cell rect crosses a page boundary;
- invalid length falls back and warns once; oversize child is clipped;
- inside `pk-print-page` in print media the toolbar and shell chrome are hidden and the sheet starts at margin plus offset.
Scenarios `label-sheet-4x6.js` and `label-sheet-a4-30up.js` (desktop/phone, light/dark, `preview` scrolling, RTL mirrors columns). Node tests: prop validation, mapping, audit fixture proving the markup passes D9. bUnit: `PkLabelSheet` attribute passthrough.

## 7. Phases (about 400 lines each)

1. Element, CSS, props, validation, node tests, meta, gallery example (about 350).
2. Browser cases, scenarios, print-media emulation helper if missing (about 300).
3. Blazor mapping and bUnit, docs, skill workflow ("print labels"), template table, fragment; gallery dogfood replacing hand-built sheets (about 200).

## 8. Open questions

1. Name: `pk-label-sheet` (issue) vs `pk-card-sheet`. Recommend `pk-label-sheet`; cards work as cells.
2. Tier `element` or `component`? Recommend `element`: renders no `pk-*`; confirm against C4 in phase 1.
3. Offsets and outline in v1, or only width/height/columns/gap as in the issue? Recommend include `offset-*` and `outline` (pre-cut stock is common); defer skip-cells (start mid-sheet) and numbering to a follow-up issue.
4. Should it hide chrome itself outside `pk-print-page`? Recommend no; one owner.
5. Stock presets in code? Recommend docs table only (size, no lock-in).
