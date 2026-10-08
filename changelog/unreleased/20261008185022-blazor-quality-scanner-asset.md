---
type: fixed
---
The PlainKit.Blazor package ships `tools/audit/scanners/literals.mjs`, the one file under `tools/` that the browser code imports (`js/quality.js`): the `/_plainkit` dev tools page, the scorecard and the quality checks failed to load ("Failed to fetch dynamically imported module ... devtools.js", the Blazor circuit ended) because the package left the whole `tools/` folder out. A test now checks that every static import of the shipped JavaScript resolves inside the package.
