---
type: added
---
`PkDataList<TItem>` (#50), a searchable, sortable, server-paged list over `PkTable`, `PkInput` (search) and `PkPagination`: `Load` (`Func<PkListRequest, Task<PkListResult<TItem>>>`) gets the search, sort, 1-based page and page size and a `CancellationToken`; the component owns the state; a new search, sort or page size returns to page 1; a superseded request is cancelled and its result ignored; a total that shrinks under the current page settles on the last page; loading and empty states, an error state with Retry, an add button, `OnRowClick`, `CurrentId` (marks the current row), the phone `cards` layout, `ReloadAsync()`. The Playground has a `/datalist` page.
