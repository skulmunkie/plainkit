---
type: changed
issue: 801
---
Blazor: `PkDataTable<TItem>` is a thin typed wrapper over `pk-data-table` and replaces `PkDataList<TItem>`, which stays for one release as an `[Obsolete]` alias (rename it; parameters and `Load` are the same, `CurrentId` is `CurrentRow` and tints the whole row). The element now owns the query, paging, states and selection, so the component's own state machine is gone. "Select all N rows" is the query: `OnSelect` raises `Scope` `all` with the search and sort (`args.ToRequest()`) and `Selected` holds only the loaded page; `LoadAllIds` is removed (on the alias it is obsolete and ignored), so run the bulk action on the server against the query.
