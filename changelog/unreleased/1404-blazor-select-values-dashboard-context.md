---
type: notes
issue: 1404
---
Blazor: `PkSelect` with `Multiple` binds its `values` array through `@bind-Values`, and `PkDashboardPage` has no `Context` parameter because `context` is the page's own filter output (seed filters with `Config.values`); both are now recorded in the mappings and the Blazor skill.
