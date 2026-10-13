---
type: changed
issue: 1247
---
The demo app page lists the first list-page chunk graph as modulepreload hints, so the Orders module, the list page type and its imports load in parallel instead of one round trip each (the first module chunk loads about 40 percent faster).
