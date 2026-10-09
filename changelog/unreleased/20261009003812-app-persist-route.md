---
type: added
---
A module route can say `persist: true`: when the next address matches the same route, the app host keeps the page and calls its `update(route)` (a page factory returns `{ update(route), destroy() }`) instead of dropping and rebuilding it. Routes without it behave as before.
