---
type: added
issue: 586
---
A new `js/context-actions.js` exports `wireContextMenu(menuEl, { items, run, resolve? })`, the shared plumbing for giving an element's rows, cards or items a right-click menu: it paints a per-open `{ action, label, shortcut?, disabled?, danger? }` list into `pk-menu-item` rows on a `pk-context-menu`'s `pk-open`, and dispatches a choice through the same `run(action, target)` an element's own toolbar or keyboard shortcuts already call. `pk-table` is the first consumer: wrap a data-driven table in a `pk-context-menu` (its rows already carry `data-pk-context="<rowId>"`) and wire it with `wireContextMenu` for a per-row menu built from capabilities the table already has, such as selection.
