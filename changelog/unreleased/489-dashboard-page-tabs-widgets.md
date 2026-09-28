---
type: breaking
issue: 489
---
`pk-dashboard-page` (and the `'dashboard'` app page type) now takes `config = { tabs?, widgets, sections?, filters?, empty? }`. The earlier `config.tiles` is gone, with no alias: rename it to `widgets` (each entry `{ key, label, kind, tab?, empty? }`) and each `sections` entry's `tiles` list to `widgets`. Each widget is now a `pk-card` that draws its own loading, error (with Retry) and empty state; `tabs` group widgets, and a tab's widgets load the first time it is shown; `filters` draw a filter bar whose selections are on `this.context`, and changing one reloads every widget that has already loaded. `load(key)` keeps its one-argument signature and now runs with `this` bound to the page element. The Blazor `PkDashboardPage` `Config` takes the new shape.
