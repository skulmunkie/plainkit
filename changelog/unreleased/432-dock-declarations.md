---
type: added
issue: 432
---
`pk-dock` panels can be declared with `data-closable="false"`, `data-collapsible="false"`, `data-open="false"` (start closed) and `data-float` (start floating); the panel with `data-group="center"` is the permanent centre (never closed or floated, and the tab a phone starts on); and `resetLayout()` (Blazor `ResetLayoutAsync`) restores the default arrangement.
