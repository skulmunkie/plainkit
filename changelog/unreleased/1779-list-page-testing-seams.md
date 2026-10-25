---
type: added
issue: 1779
---
`PlainKit.Blazor.Testing` adds `Filters()` (the filter definitions a `PkListPage` sends its element) and `RowHref(item)` (the address `RowHrefTemplate` gives that row's link) for bUnit tests, so neither needs reflection or the element's shadow DOM.
