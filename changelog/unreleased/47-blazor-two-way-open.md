---
type: added
issue: 47
---
`@bind-Open` works on `PkCombobox` (it follows `pk-combo-toggle`) and `PkCommandPalette` (it follows `pk-open` and `pk-close`), with `OpenChanged` next to it; `OnToggle`, `OnOpen` and `OnClose` still run. After a form reset (which raises no change event) a value your component mirrors can be read back in `PkForm.OnReset` with `PkRuntime.ReadFormValuesAsync(form.Element)`, which returns the form's values by control name; every component now exposes its element as `Element`. The generator accepts a list of events in a mapping's `bind`. Element sources are unchanged.
