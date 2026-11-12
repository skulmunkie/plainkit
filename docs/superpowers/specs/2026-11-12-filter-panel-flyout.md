# Filter panel as an inline-start flyout inside the list frame (#1939)

Status: design only. Verified against `main` at 9c44516c. Relates to #1935 (a plain scroll fix by the queue-53 agent).

## 1. What the consumer asked
An opt-in placement (`filterPanel: "flyout"` in config, or `placement="start"` on `pk-table-filters`): the panel slides in from the inline-start edge over the table area, contained in the list's frame; non-modal (no backdrop, no focus trap, rows stay usable); scrolls on its own with Clear filters and Close pinned; closes on Close or Escape; full-width sheet at 640px and below; count badge, `pk-toggle` and `pk-clear-filters` unchanged. A comment on the issue gives the stopgap: forward the panel parts through `exportparts` and give the table area a positioned containing block.

## 2. What the code does today
- `pk-table-filters` (table-filters.js, 38 lines): `:host{display:contents}`, a search box, a Filters trigger and `[part=panel]` with `header/heading/close/body/footer/clear`. `toggle(open)` raises cancelable `pk-toggle` and sets `open`; `updated()` sets `panel.hidden`. The panel is `flex-basis:100%` (table-filters.css line 15), so it wraps to its own line in pk-table's toolbar and pushes rows down. No Escape handling. Only hook: `--pk-table-filters-radius`.
- `pk-data-table` (data-table.js): its shadow root holds `<pk-table-filters part="filters">` in `[part=toolbar]` (data-table.html), no `exportparts`. Config filters are built by `buildFilters()` (data-table.js) as **light-DOM children of that pk-table-filters** (`filterControl()` from js/filter-controls.js), which slot into the panel body. `pk-list-page` wraps `pk-data-table` and exports only `footer, pager, pager-prev, pager-next`.
- `pk-drawer` (drawer.js): a native modal `<dialog>` (`syncDialog`/`wireDialog`) with backdrop, focus trap and inertness. "docked" is a side option, but it is still a dialog. Two reasons it cannot be used for config filters: (1) the filter controls are children of `pk-table-filters` inside pk-data-table's shadow root, and a drawer there would force re-parenting them out of the element that also accepts host-slotted extra filter controls; (2) a modal dialog makes the rows inert, the opposite of "rows stay usable". It is also in the top layer, not contained in the list frame.
- #1935: the table is height-clamped and the toolbar does not scroll, so an open panel taller than the area is clipped. The queue-53 fix (own `max-block-size` + `overflow-y:auto`) is the base this flyout reuses: a panel that scrolls on its own inside a bounded box.

## 3. Owner rule check
No new element. `pk-drawer` checked (section 2): no. A flag on the owner of the panel is the smaller change. Result: prop `placement` on `pk-table-filters`; setting `filterPanel` on `pk-data-table` / `pk-list-page` that sets it.

## 4. Options
A. **Stopgap: export parts + page CSS.** No animation (`hidden` cannot transition), no Escape, every consumer repeats the CSS. Rejected as the feature; the `exportparts` half is cheap and independent.
B. **`placement="start"` on `pk-table-filters` (recommended).** Panel `position:absolute; inset-block:0; inset-inline-start:0; inline-size:min(var(--pk-table-filters-w, 22rem), 100%)`, `display:flex; flex-direction:column`; header and footer `flex:none`, body `flex:1; min-block-size:0; overflow:auto` (the #1935 rule); `box-shadow: var(--shadow-flyout)`; slide by `transform` under `prefers-reduced-motion: no-preference`, with `hidden` replaced by `data-open` plus `inert` while closed so the transition can run. Escape closes (keydown on the panel, and on the trigger while open) and returns focus to the trigger. Non-modal: no trap, rows keep tab order.
C. **pk-drawer docked inside pk-data-table.** Rejected (section 2).

Containing block without measurement: `pk-table-filters` is `display:contents` and has no box, so the data-table provides one. `data-table.html` gets a frame as a grid (`grid-template-rows: auto 1fr`): row 1 the toolbar, row 2 a new `[part=area]` wrapper around `pk-table` with `position:relative`. The panel is absolutely positioned against the area, so it covers the table, not the toolbar: Search and the Filters trigger stay in view and the trigger closes it. No ResizeObserver, no JS for geometry. A flyout needs the panel to be a child of the area, but the panel lives in pk-table-filters' shadow root inside the toolbar; use `position: absolute` with the area as containing block through `anchor` is not portable, so the practical way is for the data-table to slot or move the filters' panel region: **open item**, resolved in PR 1 by a spike: either (a) pk-table-filters renders its panel into a named slot `panel` that pk-data-table fills from inside the area (cleanest, rule 3 compatible since both are owned by the data-table), or (b) the toolbar row itself is `position:relative` and the panel offsets by `inset-block-start: 100%` with `block-size` bounded by `max-block-size: var(--pk-table-filters-max, 60dvh)`. Recommend (a).

At 640px and below the panel is `inline-size:100%` over the area (a sheet); the trigger and close touch targets already exist.

## 5. API surface
- Core `pk-table-filters`: prop `placement` (`inline` default | `start`), reflected; new slot `panel` (option a); hook `--pk-table-filters-w`; Escape and focus return documented; `pk-toggle`, `pk-clear-filters` unchanged.
- Core `pk-data-table`: prop `filterPanel` (`inline` | `flyout`) sets `filters.placement`; new `area` part; `exportparts` adds `filters-panel,filters-body`.
- Core `pk-list-page`: `filterPanel` in `TABLE_KEYS` (config key); inner `exportparts` adds `filters-panel,filters-body`.
- Blazor: `PkFilterPanel { Inline, Flyout }` enum and `FilterPanel` parameter by mapping entry in `blazor/mappings/data-table.json` (generated); `PkListPage` takes it through `Config` JSON (or a mapping entry; `"extra": true` only if marked `existing`). Docs: table-filters and data-table meta, gallery "Flyout filters", one line in the list workflow of `scripts/skills/`, changelog `added`.

## 6. Byte cost
`table-filters.css` 981 B gz, `.js` 1,118 B gz. Flyout rules about 500 B raw (190 B gz) under `:host([placement="start"])` in table-filters.css; Escape and `data-open` about 200 B raw (90 B gz) in the js; data-table.js +120 B raw, html +80 B; list-page.js +20 B. About +0.5 KB gz in the core package. The `table` reference page does not include table-filters or data-table (confirm in the bench), so page-weight ceilings stay; if it does, the flyout css moves to a lazy adopted sheet loaded when `placement="start"` is first set.

## 7. Measuring cases and scenarios
Browser cases (new `cases-data-table-flyout.js`, 1280 and 390):
1. Open: panel rect inside the area rect on all four sides; panel inline-start equals area inline-start; top equals the area top (below the toolbar); rows do not move (first row rect identical open vs closed).
2. Pinned footer: 12 filters in a 400px frame: body `scrollHeight > clientHeight`; header and footer rects at the panel's top and bottom; Clear filters rect inside the viewport.
3. Non-modal: `elementFromPoint` over an uncovered row cell returns the row; Tab reaches a row; table not `inert`.
4. Escape and Close both close, focus returns to the trigger, `pk-toggle` fires for both.
5. 390: panel inline-size equals the area's; touch targets at least 44px.
6. RTL: panel at the right edge. Reduced motion: computed transition-duration 0s.
7. Existing badge and `pk-clear-filters` cases pass.
Scenario `table-filters-flyout.js`: click Filters, type, key Escape, resize 390x600, shots open and scrolled body; `t.within(panel, area)`, `t.inViewport(clear)`, `t.noOverlap(trigger, panel)`.

## 8. Migration
Default stays `inline`; nothing changes unless opted in. Land after #1935; the flyout PR rebases on it.

## 9. Risks
Escape must not fight an open `pk-select` listbox in the panel (close the inner popup first; check `defaultPrevented`); stacking over sticky headers (a token, no literal); a panel taller than a 2-row area (body scrolls; no min-height hack); the slot-based option must keep the ownership rules (the data-table owns both ends).

## 10. PR split
1. Spike resolution + `area` part, `exportparts`, `filterPanel` plumbing, no visual change (about 150 lines).
2. `placement="start"`: css, js, Escape, cases 1 to 4 (about 300).
3. Phone sheet, RTL, reduced motion, scenario, Blazor enum, docs, skills (about 250).

## 11. Open questions for the owner
1. Flyout covers the table area only (recommended), or the whole frame including the toolbar?
2. A shared non-modal docked panel for drawer and filters later, or keep it local?
3. Default width 22rem acceptable?
4. Should flyout ever be the default at some width (an auto mode), or stay opt-in?
