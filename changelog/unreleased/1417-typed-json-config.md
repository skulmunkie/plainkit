---
type: added
issue: 1417
---
The JSON-valued parameters of the Blazor components (`Config` on every page type, `Config`, `Values`, `Errors` and `State` on `PkPropertyGrid`, `Values` on `PkSettingsPage`) accept a typed value as well as JSON text: pass a record, anonymous object, dictionary or `JsonElement` and the component serialises it camel-case with null properties skipped. A raw JSON string still works unchanged and `@bind-Values` still reports JSON text.
