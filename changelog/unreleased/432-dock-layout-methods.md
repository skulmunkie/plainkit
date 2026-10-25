---
type: added
issue: 432
---
A `pk-dock` can be driven from code: `getLayout()` returns the drawn layout as JSON, `setLayout(json)` applies one (validated like the `layout` property, no event) and returns the repairs it made, and `openPanel(id)` / `closePanel(id)` reopen and close a panel as the Panels menu does. Blazor `PkDock`: `GetLayoutAsync`, `SetLayoutAsync`, `OpenPanelAsync`, `ClosePanelAsync`.
