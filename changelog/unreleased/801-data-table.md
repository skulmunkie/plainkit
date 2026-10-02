---
type: added
issue: 801
---
New component `pk-data-table`: a paged, searchable, sortable `pk-table` that owns its query, its `load(query)` callback and its loading, error (with Retry) and empty states, so a stale response never draws. With `selectable`, the selection survives paging and searching: `selected` holds the ids, `selectScope` is `page` or `all` (the "Select all N rows" choice), and one `pk-select` event carries the ids, the scope and the current query, so a bulk action on scope `all` runs against that query on the server. `pk-list-page` is now built on it with the same output and behaviour. The Blazor mapping `data-table` is added; the `PkDataTable` component itself follows when `PkDataList` is renamed.
