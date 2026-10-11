---
type: added
issue: 366
---
`PkDashboardPage` has a `Load` parameter (called once per widget key) and `PkDocPage` has a `LoadItem` parameter (called with the item id); each returns what the element draws, and a delegate that throws shows the element's error state with Retry. `PkDocPage.Href` and the dashboard filter selections remain open.
