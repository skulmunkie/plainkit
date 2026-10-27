---
type: changed
issue: 1656
---
The gallery data of dock, canvas, heat-map, markdown and markdown-editor ships with the package that owns the element (a core-only Blazor app serves about 16 KB gzip less); without the package the element page shows a one-line note instead of failing.
