---
type: fixed
issue: 1958
---
A tab-param (pk-tabs, pk-detail-layout, pk-record-form) in a hash-routed app now reads and writes the tab inside the hash (#/path?tab=b) instead of location.search, so a reload restores it and the route and other parameters are kept.
