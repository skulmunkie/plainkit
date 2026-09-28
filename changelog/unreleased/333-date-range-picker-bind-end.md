---
type: added
issue: 333
---
`PkDateRangePicker` in Blazor binds both ends: `@bind-End` now works next to `@bind-Start` (each follows `pk-range-change`, and `EndChanged` is raised with the new end date).
