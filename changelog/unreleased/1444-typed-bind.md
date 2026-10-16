---
type: breaking
issue: 1444
---
`PkTray.Size` is a `TraySize` and `PkWorkspace.ActivePane` a `WorkspacePane` (they stayed strings in #1408 because they are two-way bound). `@bind-Size` and `@bind-ActivePane` now work with the enum: the generator parses the wire value the element reports back to the member (an unknown value keeps the current one) and raises `SizeChanged` or `ActivePaneChanged` with it. Wire values are unchanged; replace `Size="small"` with `Size="TraySize.Small"` and `ActivePane="aside"` with `ActivePane="WorkspacePane.Aside"` (a `string _pane` field becomes `WorkspacePane _pane`).
