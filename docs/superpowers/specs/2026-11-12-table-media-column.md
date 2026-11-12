# pk-table media column that fills the row height and leads the phone card (#1938)

Status: design only, for the owner. No product code. Verified against `main` at 9c44516c, not the issue text.

## 1. What the consumer asked
A first column holding an image beside a two- or three-line title stack. Today the image is a `pk-avatar` of 2.25 to 3rem in a row about 4.5rem tall, so a picture-led list reads as text. Asked: a column option (`type: "media"` or `media: true`) with `ratio` (default 1/1) and `fit`; the image stretches to the row height with no layout shift; in `cards` (640px and below) it becomes the card's leading image; and `density` forwarded through `pk-list-page` config like `stickyHeader`.

## 2. What the code does today
- Columns are plain data in `table.js` / `js/table-vw.js`. `V.tr` (table-vw.js line 75) builds each `td` with `data-key`, `data-label`, `data-title`, `data-align`, `data-hide-phone`, `data-shed`, `data-nowrap`; the value is `String(row[c.key])` as text, or a `<slot name="cell-<id>-<key>">` when the host supplied one. `type` only decides sort and filter (`al()` reads `type === 'number'` for alignment). There is no way to render an image from data, so a consumer fills a slot per row with a `pk-avatar`.
- `pk-avatar` (`avatar.css` line 1): `--pk-avatar-size` is a fixed length; sizes stop at `lg` (`--space-12`), circle by default; `shape="square"` exists.
- Phone cards (`table.css` lines 61 to 83): `:host([cards]) tr` is a bordered block; each `td` is a flex row `label : value`; the `title: true` cell is the full-width heading (`[data-title]`, line 74). Nothing lays a cell beside the others.
- `density` only sets cell padding (`table.css` lines 21 to 22). `pk-data-table` already forwards `density`, `striped`, `maxHeight`, `stickyHeader`, `cards` from its own props (data-table.js `sync`, the `for (const k of [...])` line). `pk-list-page` forwards only `TABLE_KEYS` (list-page.js line 4), which has `stickyHeader` but not `density`, `striped` or `maxHeight`. Blazor: `PkDataTable.Density` exists (mappings/data-table.json line 274); `PkListPage` has no equivalent, only the JSON `Config`.

## 3. Owner rule check (consolidate controls first)
Can an existing element take a flag instead of a new element? Yes; no new element. Checked: `pk-avatar` (a size ladder cannot follow row height; it is a leaf, not a layout rule), `pk-media` (has a ratio but knows nothing of a table row; one slotted element per row remains), `pk-table` (owns the row and the card layout, so it can own the rule). Result: a column flag on `pk-table` rendering a plain `<img>`; `pk-data-table` and `pk-list-page` already pass `columns` through.

## 4. Options
A. **CSS-only convention on the existing slot** (`data-media` on a host-supplied cell). Fragile (arbitrary cell content), still one slot per row, no shift guarantee. Rejected.
B. **`media` column flag with a reserved media height (recommended).** Column `{ key, label, type: "media", ratio?: "1/1" | "4/3" | "16/9" | n/d, fit?: "cover"|"contain", size?: "sm"|"md"|"lg", alt?: <row key> }`. The cell renders an `<img>` from the row value (a URL; DOM APIs, no innerHTML), `loading=lazy decoding=async`, alt from `row[alt]` else empty (decorative when the title cell names the row; documented). Fill-the-row is made reliable by a floor: the media td has a block size from a token (`--pk-table-media-h`, default from `size`: sm 3rem, md 4.5rem, lg 6rem, from the `--space-*` scale), width = height times ratio (`aspect-ratio`), `padding:0`, img `position:absolute; inset:0; inline-size/block-size:100%; object-fit`. A row with taller text grows and the img follows the td (absolute inset); the width stays at the ratio of the floor height, so a much taller row crops (`fit` decides). No layout shift: the box is reserved before the image loads.
C. **True stretch, width follows measured row height.** Needs a ResizeObserver per row; shifts layout on every growth. Rejected.

Recommendation B, with an honest deviation from the issue text: the image fills the row height down to the floor and then crops; it does not widen with a taller row. Phone card: `tr:has(> td[data-media])` becomes a two-column grid (`var(--_mw) 1fr`), the media td spans all rows of column 1, the other tds stack in column 2, the `title` cell stays the heading (with no title column the first non-media td leads). Radius `--radius-md`.

## 5. API surface
- Core `pk-table` `columns` entry: `type: "media"` plus `ratio`, `fit`, `size`, `alt` (table.meta.json columns description, one example; gallery sample). A media column is not sortable or filterable; `shed` and `hidePhone` still apply.
- Core `pk-list-page` / `pk-data-table`: add `density` (and, same line, `striped`, `maxHeight`) to `TABLE_KEYS`; document in list-page meta. This half is trivial and ships first.
- Blazor: `PkTableColumn<T>` (PkTableTypes.cs) gains the media kind and ratio/fit through the mapping/generator column model; `PkListPage` density rides `Config` JSON (no new parameter) or one mapping entry `{ "name": "Density", "prop": "density" }` (`"extra": true` only if the component is marked `existing`). Skills: one paragraph in the table/list workflows under `scripts/skills/`. Changelog fragment `added`.

## 6. Byte cost (never raised)
`table.css` is 2,979 B gz, `table.js` 2,600 and `table-vw.js` 3,414; the `table` reference page ceiling is 20,100 gz (page-weight.ceiling.json) and only shrinks. So the media rules and builder live in a lazy chunk like `shed` (`js/table-shed.js`): `js/table-media.js` with an adopted stylesheet, about 900 B raw (350 B gz), loaded only when a column has `type: "media"`. Always-loaded cost: one detection line in `table.js` (about 50 B gz), which must be paid for by an equal cut elsewhere in table.js/table-vw.js in the same PR. `TABLE_KEYS` growth is about 25 B raw in the page layer of list-page. Core package: about +0.5 KB gz, to be measured on the integration tree.

## 7. Measuring cases and scenarios
Browser cases (new `core/tests/browser/cases-table-media.js`):
1. 1280: media td height equals its row height (rect of td vs tr), img rect equals td rect, td width within 1px of height times ratio for 1/1 and 16/9, with a one-line and a three-line title cell.
2. No shift: row heights identical before and after the image loads (delayed or failing src; the box stays).
3. 390 and 375, `cards`: media left edge equals the card's inner inline-start edge, its height equals the card's inner height, the title cell is to its inline-end (rects do not overlap, gap equals the token), no overflow (`scrollWidth <= clientWidth`).
4. RTL: the image sits at the inline-start (right) edge.
5. `density` compact vs comfortable on `pk-list-page` changes td padding-block; media height unchanged.
6. Selectable table: the checkbox cell still leads; cards have no select-all, as today.
Scenario `core/tests/review/scenarios/table-media.js` (elements: table, list-page): resting, hover and focus on a row link, phone, dark; `t.within`, `t.noOverlap`. Screenshots opened with Read.

## 8. Migration and back-compat
Additive. A column without `type: "media"` is unchanged; `density` forwarding changes nothing unless set. Existing `pk-avatar` slot cells keep working.

## 9. Risks
Cropping on tall rows (documented; `fit="contain"` is the escape); wrong aspect (cover); a broken URL (empty box on `--color-surface-alt`); `:has()` in the card rule (already used at table.css line 71); many images in long lists (`loading=lazy`; windowing at 500 rows needs fixed row height, check the row-height measure in table-vw.js with a media row).

## 10. PR split (about 400 lines each)
1. `density`, `striped`, `maxHeight` through `pk-list-page` config, test, docs (about 60 lines; can merge today).
2. `table-media.js` chunk, column flag, desktop layout, cases 1, 2, 4 (about 350).
3. Phone card layout, case 3, scenario, Blazor column kind, skills, gallery (about 350).

## 11. Open questions for the owner
1. Accept "fills down to a floor, then crops" instead of a width that follows a taller row?
2. Floor sizes (3 / 4.5 / 6rem), default `md`, or one size plus a token?
3. Decorative (empty alt) by default, or require an alt key?
4. May table.js give back a few bytes elsewhere to pay for the detection line?
