---
type: added
issue: 2046
---
`PkDataTable` and `PkListPage` take `RowActions` (a list of `PkRowAction`: key, label, icon, variant, group, hint, confirm), `RowActionsMax` and a typed `OnRowAction` (`PkRowActionArgs<TItem>`: `Key`, `Id`, `Item`), the Blazor surface of row actions: an icon column, named per row, a confirm for `warn` actions, a row's `_actions` for per-row state. No render fragment and no per-item callback cross the wire.
