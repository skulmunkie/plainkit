---
type: added
issue: 670
---
Blazor `PkPageContext.Compute(routes, nav, path, override)` answers "where is the reader" (nav row ids, breadcrumb trail, title) with the same algorithm as `js/page-context.js`, with no JS interop; one shared JSON fixture is tested by both sides so they cannot drift.
