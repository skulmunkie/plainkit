---
type: fixed
issue: 1401
---
`pk-list-page`, `pk-dashboard-page` and `pk-doc-page` have a `refresh()` method, so a `load` or `loadItem` callback set after the first draw (what the Blazor bridge does once the interactive circuit takes over) is used: before, a `PkListPage` could stay on "Nothing here yet" and a `PkDashboardPage` widget on its empty state when the machine was busy.
