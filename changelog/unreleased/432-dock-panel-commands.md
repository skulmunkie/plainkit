---
type: added
issue: 432
---
A `pk-dock` can float, move, collapse and raise panels from code, exactly as its menus do (same `pk-layout-change` reasons, announcements and refusals): `floatPanel(id, rect?)`, `dockPanel(id, { target, zone })` (target is a group id from `getLayout()`), `collapsePanel(id)` and `raisePanel(id)`. Blazor `PkDock`: `FloatPanelAsync`, `DockPanelAsync`, `CollapsePanelAsync`, `RaisePanelAsync`.
