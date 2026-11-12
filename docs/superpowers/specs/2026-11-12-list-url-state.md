# Opt-in URL state for lists: search, filters, sort and page in the address (#1946)

Status: design only. Verified against `main` at 9c44516c.

## 1. What the consumer asked
`PkListPage` / `pk-list-page` / `PkDataTable` keep search, filters, sort and page in memory and take them only as initial values (`InitialSearch`, `InitialFilters`, `InitialSortKey`, `InitialDescending`, `InitialPage`; list-page.json lines 76 to 110). A reload loses the view, a link cannot name it, and the common case, open a row then press Back, lands on page 1. Asked: an opt-in `UrlState="true"` (or a prefix such as `UrlState="list"`) that on every load writes search, filters (by key), sort key and direction and page to the query with `history.replaceState` (defaults omitted, other parameters and the hash kept, no history entry, no router navigation, as `TabParam` does); on first render reads them back as initial values (an explicit `Initial*` is the fallback when the address names none); with a stable documented naming (`q`, `sort`, `desc`, `page`, filter keys); and, for Blazor, exposing the list's current address, since `NavigationManager.Uri` does not follow `replaceState`, so a row link can hand it to the record page as a back target.

## 2. What the code does today
- The query machine is `pk-data-table` (data-table.js): `get query()` seeds `$query` from `opt('page'|'pageSize'|'sort'|'sortDir'|'search'|'filterValues')` once, `go(patch)` merges into `$query`, raises `pk-query-change { sortKey, descending, search, page, pageSize, filters }` and `refresh()`es; a `changed()` of any setting resets `$query` until the reader touches it (`$touched`). `pk-list-page` just sets those props from `config` (`TABLE_KEYS`, list-page.js line 4). So all state lives in `$query`; the one choke point where it changes is `go()`, plus the page clamp in `refresh()` (page past the last settles on the last).
- The tab precedent: `core/js/tab-param.js` (6 lines): `paramGet(win, key)` reads `new URL(win.location.href).searchParams`; `paramKeep(win, key, value)` does `url.searchParams.set` then `win.history.replaceState(win.history.state, '', url)` (state object kept: Blazor's router and the SDK router store theirs there). `pk-tabs` (`tabs.js` lines 44 to 56) reads the address once on the first sync (the address wins over `value`), writes only later changes (`$p` guard). `pk-detail-layout` and `pk-record-form` use the same helper. Blazor: `TabParam` is an ordinary mapped prop (mappings/tabs.json lines 24 to 26) `{ "name": "TabParam", "prop": "tabParam" }`, so no Blazor code exists for it.
- Router interplay: core `js/router.js` has a path mode (pushState on the pathname) and a **hash mode** where the query lives inside the hash (`#/path?query`, router.js header lines 24 to 25). `paramKeep` writes `location.search`, which in hash mode is the wrong place (the router reads `#/...?...`). Today's tab-param has the same limit; a list in a hash-mode app needs the hash query.
- Blazor: `PkListPageQuery` (PkListPageQuery.cs) maps the query JSON to `PkListRequest(Search, SortKey, Descending, Page, PageSize) { Filters, MultiFilters }`. The five `Initial*` parameters exist on `PkListPage` (mapped to `config` keys). `NavigationManager.Uri` is the Blazor router's, and it ignores `replaceState` made by JS.

## 3. Owner rule check
No new element. A flag on the element that owns the query: `urlState` on `pk-data-table` (and so on `pk-list-page` through config / `PkDataTable`). Reuses the tab-param helper rather than a second mechanism. Checked `pk-tabs`' `tab-param` attribute: it is the model (string = parameter name); `urlState` follows it (`""`/true uses default names, a string is a prefix).

## 4. Options
A. **Consumer mirrors it** (today's workaround): own `replaceState` in `Load`, parse into `Initial*`. Duplicated in every list.
B. **Core `urlState` on `pk-data-table` with a shared helper (recommended).** `urlState` is a string: empty or `true` means unprefixed `q`, `sort`, `desc`, `page`, `size`, and `f.<key>` for a filter; a non-empty value is a prefix (`list.q`, `list.page`) for two lists on one page. Behaviour: on the first sync (before the first load) read the address and seed `$query` and the filter controls (`seedFilters()` already exists), the address winning over the host's `Initial*` values (explicit values remain the fallback when the address names none, as the issue says); after every `go()` and after the page clamp write the whole query with one `replaceState`, omitting defaults (page 1, default page size, sort off, empty search, empty filters). Back-navigation from a record page: the list page is a new element instance on return, it reads the address on connect, so the view is restored provided the address kept the state (it does, because `replaceState` rewrote the *list entry* before the row link was followed: the entry Back returns to carries the state). Reload and shared links work for the same reason.
C. **Blazor-only** (a hand-written `PkListPage` helper using JS interop and `NavigationManager`). Rejected: rule 16 (thin 1:1 wrapper, no hand-written behaviour), and it would not serve `pk-list-page` in plain or static pages.

Recommendation B. Core owns writing and reading; Blazor adds only the mapped parameter, the event and a bridge for the address.

## 5. API surface
Core:
- `pk-data-table` prop `urlState` (string, default absent = off), `pk-list-page` config key `urlState` (add to `TABLE_KEYS`).
- Naming: `q` search; `sort` column key; `desc` present (`1`) when descending (omit ascending, omit when no sort); `page` (omit 1); `size` (omit default); filter `f.<key>=<value>`, a multiselect repeats the key; `<prefix>.` before each when a prefix is set. Names are documented in the meta (a fixed contract, tested), so a host can build `/rows?q=ebay&f.channel=ebay&page=3`.
- Event `pk-url-change { url }` (not cancelable) after each write, carrying `location.pathname + search + hash` as the browser shows it, so a host can take it as the back target; the host can also read `location` directly, the event exists for Blazor.
- Shared helper: extend `js/tab-param.js` with `paramsKeep(win, entries)` (many keys, one `replaceState`, delete a key when its value is null) and `paramsGet(win)`; **hash mode**: if `win.location.hash` starts with `#/`, read and write the query inside the hash (parse after `?` in the hash) so the SDK router is not confused; the pk-tabs call sites keep the single-key functions (back-compat), and could gain the same hash handling in a follow-up (it fixes a latent defect, note it, do not widen this PR: file an issue).
- Static mode: a `pk-list-page` or `pk-data-table` in static light-DOM markup (no `load`) has no query machine to persist; `urlState` applies only when a `load` runs (a table without `load` is the pk-table's own concern, out of scope). The standard "static slotted pages" convention (core/STANDARDS.md) is not affected.
- Router: no navigation, no `popstate` handler. Pressing Back across two states does not step through list states (no history entries are added, as asked); Back leaves the list. Forward/back into a list entry re-creates the element and restores from the entry's address. A router leave-guard (`svc-leave-guard.js`) is unaffected: it compares the address it expects and the list writes only the query of the same path; mention that guards comparing the full URL see the query change.

Blazor:
- `PkListPage.UrlState` (string?) and `PkDataTable.UrlState` as ordinary mapping entries (`{ "name": "UrlState", "prop": "urlState" }`; `"extra": true` only if marked `existing`), like `TabParam`.
- `OnUrlChange` (`EventCallback<string>`) mapped from `pk-url-change`, giving the address as the browser shows it. A row link builds `RowHrefTemplate="/rows/{id}?back={encoded}"` from it, or the host stores `CurrentAddress` in a field. No new C# class; no `NavigationManager` involvement (the problem the issue named is avoided because the list never asks the router).
- Initial values from the address on **first render** are read by core in the browser, so a prerendered Blazor Server page still renders page 1 first and the client seeds the real state on connect (one extra load, the same flash as `TabParam`). Document it; hosts that need the first server load correct keep reading the query into `Initial*` (still supported, and `Initial*` remain the fallback).
- Docs: data-table and list-page meta, a Blazor `PkListPage` doc line, the `scripts/skills/` list workflow ("a list that survives Back"), a gallery example with a link into a filtered view; changelog `added`.

## 6. Byte cost (never raised)
Loaded lazily: `js/url-state.js` (read the address into a query, build the address from a query, the naming table, the multi-value rule) about 1.0 KB raw (480 B gz), imported by `data-table.js` only when `urlState` is set (the same `import()` pattern table.js uses for `table-expand.js`). Always loaded: in `data-table.js` (14,323 B raw, 4,868 gz) a guard and a call in `go()` and the first `sync`, about +180 B raw (+90 B gz); `tab-param.js` +300 B raw (+140 B gz; it is imported by tabs, so tabs pay it unless the many-key functions live in the new lazy file, which is preferred: keep `tab-param.js` untouched and let `url-state.js` import `paramGet`). `list-page.js` `TABLE_KEYS` +10 B. The `table` reference page does not include data-table (confirm in the bench), so page-weight ceilings stay; core package about +0.6 KB gz in the lazy chunk and +0.1 KB in the data-table, to measure.

## 7. Measuring cases and scenarios
Browser cases (new `cases-data-table-url.js`; 1280 and 390 only for the layout-free ones, most are logic cases):
1. Write: type a search, choose a filter, sort, go to page 3 on a table with `url-state`: `location.search` equals the documented string; defaults omitted (page 1 absent); other parameters and the hash preserved; `history.length` unchanged; `history.state` identical.
2. Read: load a page with `?q=a&sort=name&desc=1&page=3&f.channel=ebay`: the first `load` receives exactly that query (no earlier load with defaults), the search box, the filter control and the sort header (`aria-sort`) show it, the pager shows page 3.
3. Precedence: address wins over `Initial*`; with an empty address `Initial*` are used.
4. Prefix: two lists with `urlState="a"` and `urlState="b"` do not touch each other's parameters.
5. Clear filters and a page past the last (clamp) update the address.
6. Back: navigate the page to another entry (a pushState) and `history.back()`; a recreated list restores the view from the address. (Simulated with an iframe or two documents; the Blazor sample in `blazor-browser-lab-cases.mjs` runs it for real: list, click a row, Back, view restored.)
7. Hash mode: with the SDK router in hash mode the query is written inside the hash, `location.search` stays empty and the router's current route is unchanged (no navigation event).
8. `pk-url-change` fires after a write with the browser's address.
No visual layout change, so scenarios are not needed; the Blazor browser lab case is the scenario of record (also screenshot discipline: one shot of the restored view at 390).

## 8. Migration and back-compat
Opt-in; absent `urlState` changes nothing. `Initial*` stay as the fallback. `paramGet`/`paramKeep` are untouched. A consumer that today mirrors the query itself can drop its code, or keep it (the address wins over `Initial*`, so both together are consistent only if the names match: document the names so a migrating consumer's own parameter names, if different, are not parsed twice).

## 9. Risks
Names that collide with a host's parameters (`q`, `page`): the prefix solves it, and the default names are documented rather than configurable per field; filter keys with dots (`f.` plus key, encoded); a long multiselect making long URLs (accepted); sensitive search text in the address and referrers (privacy note in the docs: opt-in, so the owner of the page decides); `replaceState` rate (called on every keystroke after the search debounce; the choke point is `go()`, already debounced); the hash-mode edge (case 7); prerendered Blazor first paint (documented); two instances of the same list on a page without prefixes (a `warnOnce`).

## 10. PR split (about 400 lines each)
1. Core: `js/url-state.js`, `urlState` on `pk-data-table` and `pk-list-page`, `pk-url-change`, unit tests for the naming and parse, browser cases 1 to 5, 8 (about 380).
2. Hash-mode handling, case 7, docs and gallery example, `scripts/skills/` workflow (about 200). The tab-param hash gap for `pk-tabs` goes to its own issue.
3. Blazor: mapping entries (`UrlState`, `OnUrlChange`), `blazor-browser` lab case (list, row click, Back restores), Blazor docs (about 250).

## 11. Open questions for the owner
1. Parameter names and the prefix scheme (`q`, `sort`, `desc`, `page`, `size`, `f.<key>`): acceptable as the public contract?
2. Should the page size (`size`) be in the address, or is it a preference rather than a view?
3. Hash mode: write the query inside the hash (recommended) or leave hash-mode apps out of scope?
4. Should Back step through list states (a `pushState` on page changes)? The issue asks for none (replace only), and this spec follows it; confirm.
5. Blazor prerender: accept the client-side first seed (one extra load), or must the server's first `Load` see the address (then a hand-written parse in the consumer stays)?
