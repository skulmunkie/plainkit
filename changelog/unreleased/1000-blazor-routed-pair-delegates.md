---
type: added
issue: 1000
---
Blazor `PkRecordPage` has `Load` and `Save` delegates and `PkListPage<TItem>` has `OnRowClick`, so the routed list and record pair works from C#. `pk-list-page` gains a `clickable` property and passes `pk-row-click` through; `pk-record-page` gains `refresh()`.
