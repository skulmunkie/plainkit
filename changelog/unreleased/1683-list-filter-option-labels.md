---
type: added
issue: 1683
---
A list load can replace the options of its select and multiselect filters: `load` may return `filterOptions` (`{ filterKey: [{ value, label }] }`) beside `rows` and `total`, and `PkListResult` has a `FilterOptions` parameter for `PkListPage` and `PkDataTable`, so a filter can show a count per option ("Missing image (12)") computed from the loaded result. The chosen values stay chosen.
