---
type: added
issue: 1730
---
`PkBulkEventArgs` has `ToRequest()` like `PkSelectEventArgs`: `OnBulk` alone gives the `PkListRequest` (search, sort, filters) a bulk action with scope `all` runs against.
