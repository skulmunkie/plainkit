---
type: added
issue: 220
---
New `pk-detail-layout` element: a record-detail page's body, main content plus a sticky sidebar of summary cards. Below a 48rem *container* width (not the viewport, so it works next to a side nav or inside a narrower pane) it collapses to one column; `sidebarFirst` puts the sidebar above the main content once collapsed, and `sidebarTwoUp` lays its own cards two-up instead of stacking one-per-row. `PkDetailLayout` is the generated Blazor component.
