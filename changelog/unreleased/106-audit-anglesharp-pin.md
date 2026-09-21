---
type: fixed
issue: 106
---
The test project no longer suppresses the AngleSharp advisory GHSA-pgww-w46g-26qg: the parser is pinned at 1.8.2, which contains the fix (the library and its consumers never referenced AngleSharp).
