---
type: added
issue: 366
---
Blazor: `PkToolPage` takes a `Run` delegate and `PkSettingsPage` a `Save` delegate (the element's `run` and `save` callbacks), so a tool or settings page is a config string plus one C# callback. A throwing delegate shows the element's own error state.
