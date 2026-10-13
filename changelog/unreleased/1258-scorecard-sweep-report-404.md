---
type: fixed
issue: 1258
---
The scorecard route no longer requests a size-sweep report that does not exist: the build leaves an empty marker until a sweep is recorded, and the Size sweep card says so instead of the page logging a 404.
