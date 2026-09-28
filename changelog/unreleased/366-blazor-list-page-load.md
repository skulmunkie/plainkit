---
type: added
issue: 366
---
`PkListPage<TItem>` (Blazor) draws a `pk-list-page` from a `Config` string and one `Load` delegate that gets the page, sort, search and filters and returns the items and the total; a throwing `Load` shows the element's own error state with Retry. The callback bridge behind `PkToolPage.Run` and `PkSettingsPage.Save` now takes a typed argument, and `PkListRequest` gains `Filters`.
