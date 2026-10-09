# Multi-value pickers and the Blazor wrapper audit (2026-10-02)

Read-only audit against `origin/main` at `ceb042d4`; nothing in source was changed. It extends `docs/superpowers/specs/2026-10-02-grid-table-list-inventory.md` (branch `origin/agent/grid-inventory`), whose section 4 layering (L0 plain js modules, L1 elements, L2 `pk-data-table` component, L3 pages) is assumed here. Owner direction applied throughout: core holds all functionality; Blazor is a thin 1:1 wrapper generated from `blazor/mappings/*.json`, with only typed generics, EditContext/ValueExpression binding, JSON serialisation, callbacks and server-specific concerns on top. An element name maps 1:1 to a component name.

---

## Part 1. Multi-value pickers and selection models

### 1.1 Findings per control

| Control (tier) | Multi? | State model | Events | Form association | Blazor binding |
|---|---|---|---|---|---|
| `pk-combobox` (element, 131 js) | **No.** One `value` string; `mode` autocomplete or select; `free` accepts typed text as the value. Async options via `pk-combo-query`. | `value` string; highlight by `aria-activedescendant`; `aria-selected` painted per option | `change`, `pk-combo-select {value,label}`, `pk-combo-query {query}`, `pk-combo-toggle {open}` | formAssociated, `setFormValue(value)` | Generated `PkCombobox`, `Value` string; async search covered by `ComboboxAsyncSearchTests` |
| `pk-tag-input` (element, 63 js) | **Yes, free text only**: no option list, no suggestions | `value` = tags comma-joined (string); `this.tags` array internal; `lockedTags` string | `input`, `change`, `pk-tags-change {value, tags}` | formAssociated; one `FormData` entry **per tag** under `name` | Generated `PkTagInput`, `Value` string (comma-joined), `LockedTags` string; no `IEnumerable<string>` binding |
| `pk-select` (element, 66 js) | **Yes** with `multiple`: a native `<select multiple>` in a skin | `value` = selected values comma-joined; `selectedValues()` exported | `change`, `input`, `pk-value-change {value}` (a string, not an array) | formAssociated; `FormData` entry per value | Generated `PkSelect`, `Multiple` bool, `Value` string. Typed `PkSelectOption` record (20 lines) for `Options` |
| `pk-select-menu` (element, 86 js) | **No** (summary says single-choice) | `value` string, reflected | `pk-change {value,label,previous}` (cancelable), `pk-open`, `pk-close` | formAssociated, `setFormValue(value)` | Generated, string |
| `pk-dropdown` / `pk-menu-item` `type=checkbox` | Per-item boolean, not a picker | `checked` attribute per item; `checkedAfter()` in `menu-logic.js`; a radio group is a sibling scan | `pk-select {item,value,checked}` | Not form-associated, no value | Generated; `Checked` per `PkMenuItem` |
| `pk-table` selection (element, `selectable`) | **Yes**, row ids | `selected` = string id array; `ids()` = ids of `view` only, so select-all covers loaded rows only | `pk-select {selected}` (bubbles; it also bubbles from menus, calendars and trees in the table's slots, so Blazor filters on `selected`) | Not form-associated | Hand-written `PkTable<TItem>`: `Selected` `IReadOnlyList<string>`, `@bind-Selected`, run-length `Ranges` decode for big selections (about 25 lines) |
| `pk-tree` (element, 124 js) | **No**: `selection` = single or none | `value` (value or label of the selected item); each `pk-tree-item.selected` | `pk-select {id}` bubbles from the item | Not form-associated | Generated, string |

Cross-cutting observations:

1. **Four encodings of "the selected things"**: a comma-joined string (`pk-tag-input`, `pk-select multiple`), a JSON array of ids (`pk-table`), a boolean per child (`menu-item`, `tree-item`), a single string (`combobox`, `select-menu`, `tree`). Comma-joining breaks for any value containing a comma, with no escape; the typed truth (`tags` in the tag input, `selectedValues` in select) is internal and only the lossy string crosses the API.
2. **Event names and details do not line up**: `change`, `pk-value-change`, `pk-change`, `pk-tags-change`, `pk-combo-select`, and `pk-select` with three different details (`{selected}` table, `{id}` tree, `{item,value,checked}` menu-item).
3. **Options plus multi exists only in `pk-select`**, a native `<select multiple>` (poor for many options: no search, no chips). `pk-combobox` has options and search but one value. `pk-tag-input` has chips but no options. "Searchable options, chips, many values" exists nowhere in core.
4. **Form association is hand-repeated**: `setFormValue(string)` or `FormData` per value, copied between `select.js` (line 61) and `tag-input.js` (line 58).
5. **Blazor binding is string-only for every picker.** No `@bind-Values` with `IReadOnlyList<TValue>`, no `ValueExpression`/EditContext for a multi-value, no typed `TValue` (enum, int, Guid). The only typed multi binding is `PkTable.Selected` (`IReadOnlyList<string>`), and by hand.
6. **Selection across pages** exists nowhere (inventory D7, #798).

### 1.2 Duplication

| # | Duplicated | Where |
|---|---|---|
| S1 | Multi-value to form: `FormData` with one entry per value | `select.js`, `tag-input.js` |
| S2 | Value list to and from an attribute string (`split(',')`, `join(',')`) | `select.js` lines 36 and 54, `tag-input.js`, Blazor `Value` strings |
| S3 | Id set arithmetic (add, remove, toggle, intersect with loaded ids, select all) | `table.js` `pick()` and its change handler (lines 24, 37-39), `table-expand.js` `toggled`, `menu-logic.js` `checkedAfter`, `tree.js` `choose` |
| S4 | Active-descendant listbox painting and `aria-selected` | `combobox.js`, `select-menu.js`, `command-palette.js` (inventory D2) |
| S5 | `nextIndex` and typeahead | `combobox.js` vs `menu-logic.js` (inventory D1) |
| S6 | Commit event with previous value and veto | only `select-menu` `pk-change` is cancelable and carries `previous` |

### 1.3 Proposal: one shared selection model and a lookup picker

#### (a) `js/selection.js` (L0 plain module: no element, no tier)

A pure, headless model, no DOM at import, the same family as `menu-logic.js` and `table-data.js` (the inventory's `js/rowset.js` absorbs it; named separately here so it can ship first):

```
createSelection({ mode: 'none' | 'single' | 'multiple', max? })
  state:  { ids: string[], scope: 'ids' | 'page' | 'all', total?, anchor? }
  ops:    set(ids) toggle(id) add(ids) remove(ids) clear() range(from, to, ordered) selectPage(pageIds) selectAll(total, query)
  query:  has(id) count() isAll() indeterminate(visibleIds)          // the header checkbox state
  codec:  toValues() -> string[]  /  fromValues(string[])             // never comma-joined: a JSON array attribute, a FormData entry per id
  form:   formData(name)                                              // removes S1
  event:  detail() -> { selected, added, removed, scope, count, total }
```

Rules: ids are strings; the selection survives row replacement (it is not intersected with the loaded rows, which is what makes `manual` paged selection work); `scope: 'all'` carries the query instead of ten thousand ids (inventory section 5 risk). Existing elements adopt it one at a time with no API change: `pk-table` (replaces `pick`, `ids`, S3), `pk-select multiple`, `pk-tag-input` (a tag is its own id), later `pk-menu-item` groups. A comma-joined `value` stays as a deprecated alias of a new array property `values`.

Event contract for every multi-value element: the commit event keeps its name and gains the detail above (`pk-tags-change`, `pk-value-change` add `selected`; additive, no break), plus `change`/`input` for forms. New elements use `pk-values-change`. Open question for the owner: align the three `pk-select` detail shapes in a breaking release.

Blazor: one generator feature for any prop marked `"multi": true` in a mapping: `IReadOnlyList<TValue> Values` + `ValuesChanged` + `ValuesExpression`, JSON serialised (categories: typed generics, EditContext binding). No behaviour. Single `Value` stays.

#### (b) `pk-lookup-picker` (new, tier **component**)

A combobox-style input (chips for the chosen values) whose popup holds a searchable, pageable `pk-data-table` with selection. For a long list (customers, products, users) where a flat `<option>` list does not scale and the user needs columns to tell rows apart.

**Tier rules.** It must render `pk-data-table`, `pk-pagination`, `pk-tag` chips and an overlay. C4 forbids a `tier: element` from rendering any `pk-*`, and C1 forbids an element naming a higher tier; a `component` may name elements and components and never a page, which is everything this needs. No `tiers.baseline.json` entry is required. Its own markup is base HTML plus those pieces; the overlay logic is a plain js module (`js/overlay.js`, inventory D3), not an element, so C4's helper rule does not apply.

| Part | Built from |
|---|---|
| Input and chips | `pk-input` (search text) plus `pk-tag` chips; roving focus via `js/roving.js` |
| Popup | the shared overlay protocol (`js/overlay.js` over `positioning.js`): Esc, outside click, `pk-close` request |
| Body | `pk-data-table` (inventory L2: `load(query)`, loading/error/empty, selection that survives paging), `selectable`, search bound to the input text, `pk-pagination` in its footer |
| State | `createSelection`, `mode: 'single' | 'multiple'`; single closes on pick |
| Form | formAssociated; `selection.formData(name)` |
| Labels | `load` returns `{ rows, total, labels? }`; chips of ids not on the loaded page use the stored label, not a refetch |

Props (sketch): `name`, `mode`, `columns`, `row-key`, `label-key`, `placeholder`, `page-size`, `max`, `disabled`, `required`, `invalid`; `load(query)` a **property callback** (as in `pk-list-page`), `values` (array), `value`. Events: `pk-values-change`, `pk-lookup-query`, `pk-open`, `pk-close`, `change`, `input`. Keyboard: Down opens and moves to the first row (table keyboard model, inventory D9), Enter toggles, Esc closes and returns focus to the input, Backspace on an empty input removes the last chip.

Order: `js/selection.js` plus the `pk-table` adoption; `pk-data-table` (inventory step 4); `js/overlay.js`; then the picker. Building it before `pk-data-table` would hand-roll the query state machine a third time (inventory D4).

Blazor: generated `PkLookupPicker<TItem, TValue>`; the only typed pieces are `Load` (`Func<PkListRequest, Task<PkListResult<TItem>>>` through `PkCallbackSlot`), `IdOf` and the `Values` multi binding. Nothing else.

It does **not** replace `pk-select` (native, best on phones), `pk-combobox` (short lists) or `pk-tag-input` (free text). A cheaper later step: `multiple` on `pk-combobox` (chips plus options over the same `selection`) for lists of tens of options; the lookup picker is for thousands.

### 1.4 Findings to file as issues (not fixed here)

1. Comma-joined multi values lose any value containing a comma (`pk-select multiple`, `pk-tag-input`); expose a real array property.
2. `pk-select multiple` and `pk-tag-input` have no typed Blazor binding.
3. `pk-table` select-all covers only the loaded rows (already #798).
4. Three incompatible `pk-select` event detail shapes.

---

## Part 2. Blazor hand-written code audit

Scope: every non-generated file under `blazor/src/PlainKit.Blazor`: about 5,900 lines in 71 files (generated components are produced by bootstrap and not counted). Line counts are `wc -l` as of this commit. Categories:

- **L-generics** typed generics (`TItem`, `TValue`). **L-bind** EditContext, ValueExpression, two-way binding. **L-json** JSON serialisation of data. **L-cb** callbacks into .NET (`PkCallbackSlot`, `EventCallback`). **L-server** server-specific concern or utility (DI, circuits, assets, time zone, hosting, router). **L-slot** a `RenderFragment` slot parameter: legitimate as a wrapper surface, but it is the only reason many mappings are marked `"existing"` (the generator does not express named slots), so it is the gap to close in the generator. **CORE** behaviour that belongs in core.

### 2.1 Components (`Components/`)

| File | Lines | Classification by chunk | Core has it? |
|---|---|---|---|
| `PkTable.razor` | 311 | parameters and markup mirroring `pk-table`: L-slot / L-json (about 70). `Rebuild`, `SameColumns`, `_byId`, `RebuildCount` (JSON rows and columns, cell slots per row): L-generics / L-json (about 55). Event handlers and `...Changed` pairs: L-bind / L-cb (about 60). `ExpandAsync` run-length decode of the selection: L-json (a transport the Blazor side chose). `HandleRowExpand` computes the new expanded list from `{id, expanded}`: **CORE** (about 8: the element should send the full array, as `pk-select` does) | Sort, filter, selection, windowing, edit are all in core. Only the expanded-array arithmetic leaks |
| `PkTableBase.cs` | 50 | shared appearance parameters (striped, hover, density...): mirror of element props, generatable | yes, element props |
| `PkRawTable.razor` | 59 | composes `HeadContent`/`ChildContent`/`FootContent` into one `<table>`: L-slot. `IsEmpty`/`EmptyText`/`EmptyContent` replace the table when empty: **CORE** (about 10) | no: the element's raw mode hides its `empty` slot. Gap in core |
| `PkDataList.razor` | 283 | `PkListState` search/sort/page/size/total, `Load` with `_sequence`, CTS cancel, retry loop of up to 3 attempts, error state with `PkAlert` and Retry, `LoadErrorText`, `NoResultsText`/`EmptyText` choice, `AddLabel` button, search `PkInput` and debounce wiring, `PkPagination` wiring, first-column identity wrapper (link, current marker, `CurrentId` bold): **all CORE** (about 215 lines). Legitimate: the typed `Load` signature, `IdOf`, `OnLoadError`, `ReloadAsync` (L-generics / L-cb, about 40) | `pk-list-page.refresh()` is the same state machine (about 35 lines); no core component for a list without page chrome (the proposed `pk-data-table`) |
| `PkListPage.razor` | 43 | `config` JSON, `Load` through `PkCallbackSlot`, `PkListPageQuery` to `PkListRequest`, `rows/total` result: L-cb / L-json / L-generics. **100% legitimate; the model of a correct wrapper** | yes |
| `PkRecordForm.razor` | 137 | layout recipe: `PkForm` + `<form>` + `PkStack` + toolbar (Cancel, Actions, Delete, Save with Busy, BusyText, SaveDisabled) + `PkDetailLayout` + error alert + `ActionsInHeader` + stable `_formId`: **CORE** (about 100). Only `OnValid`/`OnCancel`/`OnDelete` are L-cb | `pk-record-page` (153 js) is a record page from `fields` config with dirty guard, save and inline errors, but without slots for actions, sidebar, tabs. Gap in core |
| `PkFieldGroup.razor` | 110 | `PkField` + control per `PkFieldSpec` (kind to control table, `When`, `Disabled`, `HelpWhen`, `LabelAction`): **CORE** for the kind-to-control table and the visibility rule (about 70). `Get`/`Set` over `Model`, `ModelChanged`: L-bind / L-generics | yes: `core/js/page-fields.js` (58 lines) does the same for tool, settings and record pages; no element form |
| `PkFieldList.razor` | 38 | passthrough, `Items` JSON: L-json / L-slot | yes (`items` prop) |
| `PkFieldListRow.razor` | 34 | skip-empty decision around a `dt`/`dd` pair (`SkipEmpty`, `When`): **CORE** (about 10) | partly: the element hides empty `items` rows only |
| `PkAppBarSearch.razor` | 82 | typed `Items` JSON; close on `NavigationManager.LocationChanged`: L-json, L-server (router interop is Blazor-only) | yes otherwise |
| `PkSideNav.razor` | 108 | `CurrentPath` tracking from `NavigationManager`, `Collapsed`/`Open` two-way, `Persist`: L-server / L-bind / L-slot | active-item matching is in the element |
| `PkCard.razor` | 48 | passthrough and slots: L-slot | yes |
| `PkStat.razor` | 69 | passthrough, slots, `OnClick` for `pk-activate`: L-slot / L-cb | yes |
| `PkEmptyState.razor` | 32 | passthrough, slots, `Title` rename: L-slot | yes |
| `PkPageHeader.razor` | 147 | typed `PkCrumb` list: L-generics. Building the `pk-breadcrumb` children, home crumb, back link ("Back to <label>"), slotted `pk-heading`: **CORE** (about 90) | `pk-page-header` takes slotted children only; page-type code (`page-shell.js`) already builds crumbs from a `breadcrumb` config. A `crumbs` JSON prop would make this a one-line attribute |
| `PkDock.razor` | 79 | `ConfirmLayout` through `PkCallbackSlot`: L-cb | yes |
| `PkSettingsPage.razor`, `PkToolPage.razor` | 40, 43 | `Config` JSON and `Save`/`Run` through `PkCallbackSlot`: L-cb / L-json | yes |
| `PkGallery.razor` | 63 | passthrough, enum attributes | yes |
| `PkToolDock.razor`, `PkToolDockPanel.razor` | 120, 38 | panels register through a cascading value; an `ElementReference` host div is handed to `mountToolDock` (Razor must render the content itself): L-server / L-slot | n/a |
| `PkDevTools`, `PkDevToolsPage`, `PkCodeExplorer`, `PkConsole`, `PkLogs`, `PkLogSettings`, `PkPerformance`, `PkQuality`, `PkScorecard`, `PkThemeEditor` | 109, 89, 77, 55, 64, 52, 55, 47, 62, 77 | marker element plus a `mountXxx` bridge call; JavaScript owns the content: L-server / L-cb (1:1 with `core/modules/*`) | yes, modules |
| `PkStyles.razor` | 55 | where the stylesheet link is written: L-server | n/a |

### 2.2 Non-component classes

| File | Lines | Classification |
|---|---|---|
| `PkElementBase.cs` | 106 | `PkAttr` (invariant number and date attributes, JSON, class merge, inline-handler stripping), `AdditionalAttributes`: L-json / L-server. Legitimate |
| `PkCallbackSlot.cs` | 45 | .NET reference for element callback properties: L-cb |
| `PkRuntime.cs`, `PkAssets.cs`, `PkOptions.cs`, `EndpointExtensions.cs`, `ServiceCollectionExtensions.cs`, `PkHostEnvironment.cs` | 125, 114, 26, 14, 39, 41 | JS loading, static asset paths, DI, hosting: L-server |
| `PkLogging.cs`, `DevTools/PkInteropLog.cs` | 213, 80 | forwards the SDK logger (`js/log.js`) to `ILogger`: L-server |
| `PkNotifications.cs` | 121 | typed façade for `notify.js` toasts: L-server. Check that the dedupe and duration rules (4 s, 8 s, 2 s merge, five kept) live only in js and the C# only forwards (audit item, not verified line by line) |
| `PkStore.cs`, `PkSharedState.cs` | 220, 157 | typed C# form of `js/store.js` and `js/settings.js`: L-generics. If `PkStoreRule` (`Allowed`, `Min`, `Max`, `MaxLength`) is enforced in C# as well as in `store.js`, that is duplicated validation (**CORE**; audit item) |
| `PageBase.cs` | 215 | title, crumbs, status, busy with delay and minimum time (`Clock`): L-server page state; the busy delay and minimum-time constants duplicate `js/page.js` (**CORE**, about 40) |
| `PkRecordEditor.cs` | 159 | load, validate, save, delete state with DataAnnotations and `IPkUserFacingException`: L-bind / L-server (DataAnnotations and EditContext cannot live in core). Legitimate |
| `PkInputFormat.cs` | 67 | typed parse and format helpers for `PkInput`: L-generics |
| `PkTimeZone.cs` | 161 | server time zone resolution: L-server |
| `PkListTypes.cs` | 118 | `PkListRequest`, `PkListResult<T>`: L-generics / L-json. `PkListState` (page clamp, `SetTotal`, `SetSearch`, about 60 lines): **CORE** duplicate of `js/list-query.js` (29 lines) |
| `PkTableTypes.cs`, `PkTableColumn.cs` | 180, 88 | event args, `PkTableRows.Serialize`, `PkTableColumn<TItem>` with `Cell`, `Text`, `Editor`: L-generics / L-json / L-slot |
| `PkFieldGroupTypes.cs`, `PkFieldListTypes.cs` | 130, 16 | `PkFieldSpec<TItem>`, `PkFieldKind`: L-generics (spec shape duplicates `page-fields.js` config; unify names) |
| `PkEnums.cs`, `PkSelectOption.cs`, `PkCrumb.cs`, `PkChartData.cs`, `PkDockTypes.cs`, `PkGalleryImage.cs`, `PkScoreTarget.cs`, `PkThemePreset.cs`, `PkAppBarSearchTypes.cs` | 107, 20, 6, 22, 6, 22, 25, 17, 19 | DTOs and enums for JSON: L-generics / L-json; `PkEnums` could be generated from `meta.json` |
| `DevTools/*` (`PkSnapshot`, `PkMappingInfo`, `PkCircuitState`, ...) | about 580 | inspector, snapshot, circuit state: L-server |

### 2.3 What is not legitimate

About 650 to 800 hand-written lines are behaviour that belongs in core:

| Item | Lines | Core home |
|---|---|---|
| `PkDataList` state machine, retry, search, identity link | about 215 | `pk-data-table` component (inventory L2) |
| `PkListState` paging | about 60 | `js/list-query.js` (exists) |
| `PkRecordForm` composition and toolbar | about 100 | slots `actions`, `sidebar`, `tabs`, `header-actions` on `pk-record-page` |
| `PkFieldGroup` kind-to-control, `When`, visibility | about 70 | `pk-field-group` element over `js/page-fields.js` |
| `PkPageHeader` crumbs, home, back link | about 90 | `crumbs` JSON prop on `pk-page-header` |
| `PkRawTable` empty replacement | about 10 | raw-mode `empty` slot in `pk-table` |
| `PkTable.HandleRowExpand` array arithmetic | about 8 | element sends the full `expanded` array |
| `PkFieldListRow` skip-empty | about 10 | `pk-field-list` hides empty slotted pairs |
| `PageBase` busy delay and minimum time | about 40 | one rule in core (`page.js` and `pk-loading-overlay`) |

### 2.4 Proposed 1:1 name map

Old names stay one minor release as `[Obsolete("Use X")]` subclasses (a deprecation alias is `class PkDataList<T> : PkDataTable<T>`), then are removed in the next breaking release.

| Old (hand-written) | New (generated from the element) | Notes |
|---|---|---|
| `PkTable<TItem>` | `PkTable<TItem>` | already 1:1; shrinks to the typed `Columns`/`Items`/`IdOf` shim |
| `PkRawTable` | `PkTable` (non-generic, raw slots) | alias `PkRawTable` |
| `PkDataList<TItem>` | `PkDataTable<TItem>` | element `pk-data-table`; alias `PkDataList` |
| `PkListPage<TItem>` | `PkListPage<TItem>` | already 1:1 |
| `PkRecordForm` | `PkRecordPage` | element `pk-record-page` with slots; alias `PkRecordForm` |
| `PkFieldGroup<TItem>` | `PkFieldGroup<TItem>` | element `pk-field-group` (new); name stays |
| `PkFieldListRow` | removed (the element hides empty rows) | alias for one release |
| `PkAppBarSearch`, `PkSideNav`, `PkCard`, `PkStat`, `PkEmptyState`, `PkPageHeader`, `PkDock`, `PkSettingsPage`, `PkToolPage`, `PkGallery`, `PkFieldList` | unchanged | already 1:1; leave `"existing"` once the generator supports named slots and typed JSON lists |
| `PkToolDock`, `PkToolDockPanel`, `PkDevTools*`, `PkConsole`, `PkLogs`, ... | unchanged | mounts of core modules |
| `PageBase`, `PkRecordEditor`, `PkStore`, `PkSharedState`, `PkNotifications`, `PkTimeZone`, `PkInputFormat` | unchanged | server utilities; move under a `Server/` folder |

### 2.5 Proposed enforceable rule and test

New node test `scripts/tests/blazor-wrapper.test.mjs`, run in the `node` job of `scripts/verify.mjs`, with a baseline `blazor/handwritten.baseline.json` that only shrinks (the pattern of `core/tools/tiers.baseline.json`):

1. **Inventory.** Every non-generated `.razor` or `.cs` under `blazor/src/PlainKit.Blazor` is listed in `blazor/handwritten.json` with a `category` from the fixed set (`generics`, `bind`, `json`, `callback`, `server`, `slot`, `dto`) and, for a component, the element or module it wraps. An unlisted file fails with a `FIX:` line.
2. **Name parity.** Every `pk-*` element with a mapping yields exactly one component named by the tag (`pk-data-table` to `PkDataTable`); a hand-written component whose name matches no element must be category `server` or `dto`, or be on the baseline.
3. **No behaviour.** In a non-`server` hand-written file the test fails on: a `.razor` that instantiates two or more other `Pk*` components in its markup without an entry marked `wrap` (a layout recipe like `PkRecordForm`); `CancellationTokenSource`, a request sequence counter or a retry loop outside `PkCallbackSlot` and `PkRecordEditor`; `Timer` or `Task.Delay` outside `PageBase`. Plus a per-file line budget set at today's counts that only goes down, like the size budgets.
4. **`"existing"` needs a reason.** A mapping with `"existing": true` carries `existingReason` from `typed-generics`, `named-slots`, `router`, `callback`; a new one without it fails. Target: zero `named-slots` once the generator learns `RenderFragment` slots, which removes `PkCard`, `PkStat`, `PkEmptyState`, `PkPageHeader` and `PkFieldList` from the list.
5. **Parameter parity.** Every behaviour parameter of a hand-written component (for example `SearchDebounceMs`, `PageSize`) has a same-named prop in the element's `meta.json`; one without it fails unless its category is `generics`, `bind`, `callback` or `server`.

Order: write the inventory (rule 1) first, it is cheap and fixes the baseline; each lift-out in 2.3 is its own issue and removes baseline entries.
