---
type: fixed
issue: 959
---
`PkCodeExplorer` given an in-memory `Snapshot` (the dev tools Files tab) no longer sends the file contents to the page: it sends a lean list (path, language, line count) and the explorer's lazy provider reads each file's text through the component on demand, as the SDK's own Files page does with a server. A source root of about 2500 files (13 MB) froze the browser tab; tree, viewer, outline, search and reports keep working.
