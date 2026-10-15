---
type: added
issue: 1375
---
The Blazor components expose the documented element methods as awaitable calls: `ShowAsync`, `HideAsync` and `ToggleAsync` (dialog, drawer, popover, tooltip, select-menu, split-button and more), `FocusAsync` on the form controls, `RefreshAsync` on the data table, `ValidateAllAsync` on the form, `FocusFieldAsync` on the field group and a few more, plus `CallAsync(name, args)` for any other method of the element.
