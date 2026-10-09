# Grid, table, list and listbox inventory (2026-10-02)

Read-only inventory against `origin/main` at `ceb042d4`. Nothing was changed. Line counts are from `wc -l` of the hand-written files (js / css / html template, test files excluded) and are approximate. Related: #798, #423, #436, #699, #670, #736.

Note on #736: at this commit the tiers are a `tier` field in each `*.meta.json` and the folders are still flat under `core/elements/`. The rules (C1: an element's own js/html/css may not name a higher tier; C4: a `tier: element` element renders no `pk-*`) are enforced by `core/tools/tiers.mjs`. Every proposal below is written to pass C1 and C4 as they stand.

## 1. Inventory

### 1.1 Row sets: tables, lists, datasets

| Element | Tier | Files (under `core/elements/<n>/`) | js / css | What it renders internally | Used by |
|---|---|---|---|---|---|
| `pk-table` | element | `table.{js,css,html,meta.json}` + `core/js/table-data.js` 25, `table-vw.js` 70, `table-expand.js` 65, `table-edit.js` 196 | 78 / 55 (+356 in helper modules) | Raw `<table>` in its shadow tree built with a local `h()` helper (raw `<input type=checkbox>`, `<th>`, `<td>`), slots for toolbar, bulk, empty, footer, caption, per-cell `cell-<id>-<key>`, `detail-<id>`. A second mode wraps a host-supplied `<table>` in the default slot. | `pk-list-page` (shadow), samples (patterns 2, templates 3), gallery 1, modules `scorecard` 2 and `theme-editor` 1, Blazor `PkTable`/`PkRawTable`/`PkDataList`, both playgrounds |
| `pk-table-filters` | element | `table-filters.{js,css,html}` | 31 / 23 | Debounced search `<input>`, Filters trigger with count badge, panel around slotted fields. Reports `pk-search`, `pk-toggle`, `pk-clear-filters`; filters nothing itself. | `pk-list-page`, Blazor mapping `table-filters.json` |
| `pk-pagination` | element | `pagination.*` | 82 / 24 | Page buttons, page-size select. Emits `pk-page`, `pk-page-size`. | `pk-list-page`, Blazor `PkDataList`, samples 4, gallery |
| `pk-pager` | element | `pager.{css,html}` | 0 / 21 | Prev/next styled shell, no behaviour. | few |
| `pk-list` | element | `list.*` | 9 / 26 | Slotted prose list with `role=list`, children get `role=listitem`. | no outside use found |
| `pk-list-group` | element | `list-group.*` | 7 / 9 | Same as `pk-list` for card-like rows. | samples 5 |
| `pk-grid` | element | `grid.*` | 20 / 19 | CSS layout grid (`min`, `columns`, `ratio`). Not a data grid. | samples 9, gallery |
| `pk-property-grid` | component | `property-grid.*` | 181 / 5 | Key/value editor rows. | no outside use found |
| `pk-field-list` | component | `field-list.*` | 37 / 13 | Label/value rows for a record. | samples 6, `record-page`, `wizard-page`, Blazor `PkFieldList` |
| `pk-tree` | element | `tree.*` | 124 / 1 | WAI-ARIA tree, `flattenTree`, own arrow/typeahead logic. | samples 2, `code-explorer` module |
| `pk-kanban` / `pk-sortable` | component / element | `kanban.*`, `sortable.*` | 167 / 168 | Pointer and keyboard reorder lists. | none found outside the gallery |

### 1.2 Data-aware compositions and page types

| Element | Tier | Files | Size | What it does | Used by |
|---|---|---|---|---|---|
| `pk-list-page` (page type `list`) | page | `list-page.*`, `core/js/app/pages/list.js` 19, `js/page-states.js` 41, `js/page-shell.js` 113, `js/filter-controls.js` 21 | 119 js / 4 css; Blazor `PkListPage.razor` 43 | Shadow tree: header, `pk-table manual`, `pk-table-filters`, actions, `pk-pagination`, state box. Owns the query object `{page, pageSize, sort, sortDir, search, filters}`, `load(query)` with a stale-request token, loading/error+Retry/empty states, filter control construction from config. | `core/js/app` (`list` page type), `pk-master-detail-page`, sample app `orders.js`, Blazor |
| `pk-master-detail-page` (`master-detail`) | page | `master-detail-page.*`, `pages/master-detail.js` 25 | 66 / 15 | A `pk-list-page` beside (wide) or instead of (narrow) the record the route selected; Back button; `mountDetail(pane,id)` is a callback. | `core/js/app` only |
| `pk-record-page` (`record`) | page | `record-page.*`, `pages/record.js` 23 | 153 / 7; Blazor `PkRecordForm` 137 | View/edit form from `fields` config via `pk-field-list`/`pk-detail-layout`; dirty guard, save, inline errors. | `core/js/app` only |
| `pk-dashboard-page` | page | `dashboard-page.*` | 146 / 9 | Tile grid, per-tile async. Not a row set; listed for completeness. | |
| Blazor `PkDataList<TItem>` | (razor, no element) | `Components/PkDataList.razor` | 283 | `PkTable Manual` + `PkInput type=search` in the toolbar slot + `PkPagination` in the footer. Owns `PkListState` (search, sort, page, size, total), `Load(PkListRequest)` with sequence number and CTS cancellation, error state with Retry, first-column "identity" wrapper (link to Tab to, current-row mark). | Playground `DataList.razor`, WasmPlayground, tests; guides |
| Blazor `PkTable<TItem>` | (razor over `pk-table`) | `PkTable.razor` 311 + `PkTableBase.cs` 50 + `PkRawTable.razor` 59 + `PkTableTypes.cs` 180 + `PkTableColumn.cs` 88 | ~690 | Typed columns and rows serialised to JSON attributes; cell templates as slotted spans; two-way Selected/Sort/Filters/Expanded. | `PkDataList`, apps |
| Blazor `PkListPage<TItem>` | razor over `pk-list-page` | `PkListPage.razor` 43 + `PkListTypes.cs` 118 | 161 | JSON config + `PkCallbackSlot` for `load`. No selection. | Blazor apps |

### 1.3 Listbox-style and menu elements

| Element | Tier | js / css | Roles it renders | Data source | Shared helpers it uses |
|---|---|---|---|---|---|
| `pk-combobox` | element | 131 / 30 | `role=combobox` input and trigger button, `role=listbox` popup, `role=option` divs cloned from a `<template>` | slotted `<option>` children | `positioning.js` only. Has its **own** `nextIndex` and `typeaheadIndex` |
| `pk-select-menu` | element | 86 / 62 | `button role=combobox`, `role=listbox`, `role=option` | slotted `<option>` | `positioning.js`, `menu-logic.js` |
| `pk-select` | element | 66 / 21 | native `<select>` in a token skin | `options` prop or slotted options, optgroups, `multiple` | none (native), `buildOptions` is exported |
| `pk-command-palette` | element | 75 / 49 | native `<dialog>`, input, `role=option` rows, group headings | `items` prop, fuzzy ranking in `palette-logic.js` | `menu-logic.js` (`nextIndex`, `syncDialog`, `safeLink`) |
| `pk-dropdown` | element | 52 / 34 | `pk-menu-item` rows in a `menu` layer | slotted `pk-menu-item` | `menu-logic.js` `moveFocus`, `positioning.js` |
| `pk-context-menu` | element | 44 / 24 | same, opened at pointer/Shift+F10/long-press, reports `data-pk-context` of the row | slotted `pk-menu-item` | `menu-logic.js`, `positioning.js`, `context-actions.js` 51 |
| `pk-menu-item` | element | 62 / 70 | `menuitem(checkbox/radio)`, submenu | slot | `menu-logic.js` |
| `pk-split-button`, `pk-tag-input`, `pk-app-bar-search`, `pk-calendar`, `pk-tabs` | element | | each has its own `role=option/listbox/menu` use | | partial |
| `pk-tree` | element | 124 / 1 | `tree`/`treeitem` | slotted `pk-tree-item` | own `treeKey` |

Blazor: `PkSelect`, `PkCombobox`, `PkSelectMenu`, `PkContextMenu`, `PkTree`, `PkGrid` are generated from `blazor/mappings/*.json`; only `PkTable`, `PkRawTable`, `PkDataList`, `PkListPage`, `PkRecordForm`, `PkFieldList` are hand-written. Samples that hand-roll nothing here: no sample or template builds its own listbox; the duplication is inside core.

## 2. Concern-by-element matrix

Legend: Y = implemented in the element, `via X` = delegated, `-` = not provided, host = the host owns it.

| Concern | pk-table | pk-list-page | pk-master-detail-page | PkDataList (Blazor) | pk-combobox | pk-select-menu | pk-command-palette | pk-dropdown / context-menu | pk-tree |
|---|---|---|---|---|---|---|---|---|---|
| Row/column model | Y (`columns`, `rows`, `rowKey`, raw table mode) | via table | via list-page | via PkTable (`PkTableColumn<T>`) | options from slotted `<option>` | same | `items` array | slotted menu items | slotted tree items |
| Single selection | `clickable` + `pk-row-click`, `current-row` | rowHref only | route-driven `recordId` | OnRowClick, CurrentRow | Y (value, form-associated) | Y | run on Enter | pk-select | Y |
| Multi-select, select-all | Y, ids of loaded `view` only, no "all N across pages" | - | - | **-** (#798) | - | - | - | checkbox items | - |
| Selection across pages | - | - | - | - | - | - | - | - | - |
| Sorting | Y client, or `manual` (reports `pk-sort`) | Y server (`load(query)`) | via list | Y server | - | - | rank | - | - |
| Search / filter | Y per-column filter row (client or manual); no global search | Y via `pk-table-filters` + `filterControl` | via list | Y (PkInput in toolbar) | Y substring (`filterOptions`), async via `pk-combo-query` | - (typeahead) | Y fuzzy | typeahead | typeahead |
| Paging | none (windowing at 500 rows) | Y server, `pk-pagination` | via list | Y server | - | - | - | - | - |
| Keyboard navigation | rows are tab stops only when `clickable`; sortable header buttons; edit mode has grid roles (`table-edit.js`) | via table | via list | via table (first-column link) | Y own arrows/Home/End/typeahead | Y via `menu-logic` | Y own `active()` + `nextIndex` | Y `moveFocus` | Y own |
| ARIA semantics | native table; `role=grid` on tbody only when `editable` | via table | | via table | combobox + listbox + option, `aria-activedescendant` | same | option rows, `aria-activedescendant` | menu/menuitem | tree |
| Virtualization | Y (`table-vw.js`, >=500 rows, not for expandable or slotted) | via table | | via table | - | - | - | - | - |
| Loading / empty / error | Y loading skeleton, empty slot; no error | Y all three, Retry, token race guard | Y plus `none` state | Y all three, Retry, CTS | empty slot "No matches" | - | empty + status text | - | - |
| Responsive | Y phone cards, `hidePhone` | via table | Y pane switch | via table | popup is fixed-positioned | same | dialog | Y submenu on phone | - |
| Overlay positioning | - | - | - | - | Y (`positioning.js`) | Y | native dialog | Y | - |
| Row actions / context | `data-pk-context` per row + `context-actions.js` | `actions` buttons only | | ToolbarContent, AddLabel | - | - | - | - | - |

## 3. Duplication map

| # | Duplicated logic | Where | Approx lines | Notes |
|---|---|---|---|---|
| D1 | `nextIndex` and `typeaheadIndex` re-implemented | `combobox.js` (own, ~14 lines, different `typeaheadIndex` signature and wrap rules) vs `js/menu-logic.js` (the shared one, which already states it serves dropdown/context-menu/select) | 14 | Pure, so the first low-risk merge. Combobox typeahead signature differs (`labels, buffer, from`), so adopt the shared one and keep the behaviour tests. |
| D2 | Listbox option painting, active-descendant highlight and `scrollIntoView` | `combobox.updated()+highlight` (~25), `select-menu.build()+active()` (~20), `command-palette.paint()+active()` (~30), `table-edit.js` (own active cell) | ~75 | Same shape: build `role=option` rows, mark `aria-selected`, track an active index, set `aria-activedescendant`, scroll into view. No shared helper. |
| D3 | Open/close + outside click + positioning + `pk-close` request/veto | `dropdown`, `context-menu`, `select-menu`, `combobox`, `split-button`, `date`... | ~10 each, ~60 | `positioning.js` (103) already shares `place/autoUpdate/onOutside`; the request/emit protocol is copy-pasted per element. |
| D4 | Query/load/state machine for a dataset | `list-page.refresh()` (~35, token, loading, error+Retry, empty) vs Blazor `PkDataList` (~180 code: sequence, CTS, error, state) | ~215 | Two implementations of the same state machine in two languages, **plus** a third Blazor wrapper `PkListPage` that wraps the element. The `PkDataList`/`PkListPage` pair is the user-visible symptom: the element-backed `PkListPage` has no selection and `PkDataList` has no filters panel. |
| D5 | Toolbar search | `pk-table-filters` (31) vs `PkDataList`'s own `PkInput type=search` in the table toolbar vs per-column filter row in `pk-table` (`data-filter`, ~6 lines) vs `pk-app-bar-search` | ~60 | Three different search affordances on one dataset. |
| D6 | Paging UI binding | `list-page` wires `pk-page`/`pk-page-size` by hand (5 lines); `PkDataList` the same in Razor | ~15 | Fine as such; becomes part of a data layer. |
| D7 | Selection model | `pk-table` selection (`pick`, `ids`, `selected`, select-all, indeterminate) is the only one; combobox/select-menu keep a single `value` in their own way; `menu-item` has check/radio state | ~40 | The table's selection is limited to the rows in `view`, which is exactly the gap #798 describes. |
| D8 | Hand-assembled list+record pairs in samples | `templates/crud`, `master-detail`, `routed-list-detail` (91 js), `patterns/master-detail-pattern` (44), `patterns/filter-table` (59), `patterns/search-results` (63) | ~270 | Issue #699. Page types exist (`list`, `record`, `master-detail`) but only `app/modules/orders.js` uses them. |
| D9 | Row identity and first-column link | `PkDataList.Identity(...)` wraps the first column cell so there is a keyboard stop; the element has a `tabIndex=0` fallback in `table-expand.js` for `clickable`. `PkTable` docs say rows are keyboard stops, `PkDataList` docs say they are not. | ~30 | A doc/behaviour inconsistency to resolve when selection is added. |
| D10 | Title bar / state region per page type | `list-page`, `master-detail`, `record`, `states`, `tool`, `settings` each call `showTitleBar`, `showState` | ~10 each | Issue #423 (partly done through `page-shell.js` 113). |

## 4. Proposed layering

Principle: a **tier: element** may not render `pk-*` (C4), so the shared base must not be a custom element that other elements embed. It is a **plain JS module** (not an element, no tier), the way `menu-logic.js`, `positioning.js` and `table-data.js` already are. Elements consume it; components and pages compose elements.

```
L0  js modules (headless, pure, no DOM at import)
      js/rowset.js      ids, active index (next/prev/home/end/typeahead), selection model (single | multi | select-all with scope page | all),
                        filter/sort of an in-memory row list. Absorbs menu-logic's nextIndex/typeahead/moveFocus, combobox's copies,
                        table-data.js (sortRows, filterRows) and the table's ids/pick.
      js/listbox.js     (DOM side) paint options, aria-selected, activedescendant, scroll-into-view; used by combobox, select-menu, command-palette
      js/overlay.js     open/close/request/outside/place protocol (D3)
L1  elements (tier element, raw HTML only)
      pk-table          keeps its raw <table>; uses L0 rowset for selection and active row; adds select-all scope (`select-all-total`, event `pk-select-all`) and keyboard row navigation
      pk-combobox, pk-select-menu, pk-command-palette, pk-dropdown, pk-context-menu: use L0 listbox/overlay, keep their own markup
      pk-table-filters, pk-pagination: unchanged
L2  component (new, tier component): pk-data-table   -- the "data layer"
      composes pk-table (manual), pk-table-filters, pk-pagination, bulk bar, state region. Owns the query {page,pageSize,sort,search,filters}, load(query)->{rows,total,ids?},
      token race, loading/error+Retry/empty, selection that survives paging and search ("Select all 112" scope). This is the current body of
      pk-list-page.refresh() and Blazor PkDataList lifted into one place.
L3  pages (tier page): pk-list-page = pk-data-table + title bar + actions + route wiring; pk-master-detail-page = list page + record pane; pk-record-page unchanged.
      Page types in js/app/pages stay one factory per page element (C3).
Blazor: PkDataList becomes a thin wrapper of pk-data-table (selection, Load via PkCallbackSlot); PkListPage and PkDataList converge on one component; PkTable stays the typed low-level table.
```

### When to use which

| Need | Use |
|---|---|
| Show tabular data you render yourself, no paging or search | `pk-table` (client sort, filter, select, windowing) |
| One dataset with search, sort, paging and optional selection, inside a page of your own layout | `pk-data-table` (L2) / `PkDataList` |
| Whole route that lists a collection with title bar, filters, row links | `list` page type (`pk-list-page`) |
| List beside the record, same route | `master-detail` page type |
| List and record as two separate routes | `list` + `record` page types (what #699 asks to demonstrate) |
| Pick one value from options, possibly typing to filter | `pk-combobox`; no typing: `pk-select` (native, forms) or `pk-select-menu` (styled) |
| Actions on a row or element | `pk-dropdown` / `pk-context-menu` (+ `pk-table` `data-pk-context`) |
| Jump to commands/routes | `pk-command-palette` |
| A prose or card list with no selection or paging | `pk-list` / `pk-list-group` |
| Not a data grid: layout columns | `pk-grid` |

Tier rules check: L0 modules are outside the tiers (no `pk-*` rendered); L1 stay `tier: element` and render only base HTML (`pk-table` already does); L2 `component` may name elements (`pk-table`, `pk-pagination`, `pk-table-filters`) and no page; L3 `page` may name components and elements. `pk-list-page` today (tier page) already names `pk-table` directly, which is legal (C1 checks upward only). `pk-master-detail-page` names `pk-list-page` (same tier), which C1 allows. Nothing here needs `tiers.baseline.json` entries.

## 5. Risks and proposed sequence

Risks:
- **Size budgets are one-way** (per-element gzip, `pk-table` is already pushed into `table-vw.js`/`table-expand.js`/`table-edit.js` for that reason). New behaviour must come from shared modules that are lazily imported, not more code in `table.js`.
- **API surface baseline** (`api.baseline.json`): a new element and new events are API changes; they must be part of a release PR version bump.
- **Blazor parity**: each element change touches `blazor/mappings/*.json`; `PkTable.razor` is hand-written and 311 lines, so selection scope has to be added there too.
- **Behaviour regressions in combobox typeahead** when switching to the shared `typeaheadIndex` (different wrap/start rules).
- **Selecting "all N" with ids not loaded**: events must carry a scope (`page` or `all` plus the query) rather than 10k ids; the host decides how to expand it. The existing run-length id trick in Blazor must be preserved.
- **Two Blazor components for the same page** (`PkDataList`, `PkListPage`): converging changes public API; keep both until the new one is released and mark the old ones as superseded (minor bump, not break).
- Table keyboard model (D9) differs between docs and code; fix before adding select-all affordances.

Sequence (each step small, main releasable, each with a changelog fragment where visible):
1. `combobox.js`: use `menu-logic.js` `nextIndex` and `typeaheadIndex` (D1). Pure refactor, existing browser cases guard it. No API change.
2. Extract `js/rowset.js` from `table-data.js` + the table's `ids/pick`; `pk-table` and `table-edit.js` use it. No API change.
3. Add selection scope to `pk-table`: `select-all` event carries `{ scope, count }`, optional `total` attribute to show "Select all N"; selection survives `manual` row replacement (ids are kept, not intersected with the loaded page). Additive; Blazor `PkTable` gets `SelectAllTotal`, `OnSelectAll`.
4. Move the query/load/state machine from `list-page.js` into a `pk-data-table` component (L2) with the same config; `pk-list-page` becomes title bar + `pk-data-table`. Output identical; browser case for state transitions.
5. Add `Selectable`, `Selected`, `OnSelect` and scope to `PkDataList` (closes #798), implemented over step 3; then repoint `PkDataList` and `PkListPage` onto `pk-data-table`.
6. `js/listbox.js`: shared option painting and active-descendant for combobox, select-menu, command-palette (D2); add `pk-combobox` async options as the pattern lands.
7. `js/overlay.js` for the open/close/request protocol (D3), one element per PR.
8. Samples: replace `templates/master-detail` and `patterns/master-detail-pattern` with the page types; add the routed list + record template (#699).

Steps 1, 2 and 6 are independent of the rest; 3 gates 5; 4 gates the Blazor convergence.

## 6. Relationship to the open issues

- **#798** (PkDataList has no Selectable/Selected/OnSelect; select-all across pages; selection survives paging and search; tabs over one list; extra column filters): this is the missing selection scope (D7) and the doubled implementation (D4). Steps 3 and 5 close it. The "run the bulk action server side from the filter" requirement means `pk-select-all` should carry the request, not just ids.
- **#423** (base page chrome: title bar, tabs, state region, content): the page types still each call `showTitleBar`/`showState`; the L3 pages in this proposal should reuse whatever that issue produces. It is orthogonal to the data layer but is the reason `pk-data-table` should not own the title bar.
- **#436** (list-page deferrals: dashboard page, 10k-row <=100ms first-paint case, `ctx.search` injection scenario, per-tile async case): the 10k perf case and the `ctx.search` scenario should be written against `pk-data-table` once step 4 lands; `table-vw.js` windowing is the mechanism measured.
- **#699** (four overlapping list/record samples; the plain routed list + record pair is missing): D8. The page types it names (`list`, `record`, `master-detail`) are the layers above; step 8.
- **#670** (a standard page/route context so side nav, breadcrumbs and page header stop re-deriving the route): relevant to L3 only (page types read breadcrumb/title from one place); not to the row-set concerns.
- **#736** (composition tiers): defines the rules this layering must satisfy; the tier field exists, the physical folders are the later step (see the spec's step list). A new `pk-data-table` would be the first element that has to be placed in `components` in either mechanism.

## 7. Open questions for the owner

1. Is a headless JS module (L0) acceptable as the "base row-set element", given C4 forbids an element embedding another? Or should there be a real `tier: element` base such as a `pk-rowset` that table, combobox and menus extend (not possible by composition, only by shared class), which would conflict with "no new base-class hooks"?
2. Should `pk-data-table` be a new element (new API surface, new Blazor mapping) or should `pk-list-page` simply gain the title-bar-less mode? The former keeps pages thin; the latter adds no new tag.
3. Selection across pages: should the event carry only `{ scope: 'all', query }` (host re-queries) or also ids when the total is below a threshold (the 64+ run-length trick exists in Blazor)?
4. Two Blazor components for one page type (`PkDataList`, `PkListPage`): converge on `PkDataList` (typed, `Load`) and deprecate `PkListPage`, or keep both?
5. Should `pk-table` rows become keyboard stops (arrow navigation, Space to select) in data-driven mode, so it can claim `role=grid` semantics, or stay a native table with a link in the first column? This decides whether a shared active-row model (L0) applies to the table at all.
6. `pk-select` (native) vs `pk-select-menu` vs `pk-combobox select` mode: three selects with overlapping use. Keep all three, or fold `pk-select-menu` into `pk-combobox` (its `mode="select"` already does the same job)?
7. Is the `pk-pager` shell (no js) still wanted next to `pk-pagination`?
