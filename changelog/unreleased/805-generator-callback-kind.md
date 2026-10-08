---
type: changed
issue: 805
---
`PkDock`, `PkSettingsPage` and `PkToolPage` are now generated from their mappings instead of hand-written: the Blazor generator has a callback parameter kind (a typed delegate handed to the element as a callback property, with the element's abort signal available as a `CancellationToken`). Their parameters, types and behaviour are unchanged (`ConfirmLayout`, `Save`, `Run`), except that `Config`, `Values` and `RunLabel` no longer default to `"{}"` or an empty string: an unset parameter sends no attribute, so the element's own default applies.
