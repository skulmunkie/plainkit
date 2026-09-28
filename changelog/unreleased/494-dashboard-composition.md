---
type: added
issue: 494
---
A dashboard route with no config of its own is composed from the modules: a module declares `dashboardTabs` and `dashboard` (widget entries with their own `load`) in `defineModule`, the first module to declare a tab owns its label, and duplicate widget keys are an error naming both modules. A page gets `ctx.modules()` to read every module the user may open. `pk-dashboard-page` itself is unchanged.
