---
type: added
issue: 1943
---
The shared title bar of every page type that uses it (tool, record, sections, settings, dashboard, master-detail) draws its `actions` with one renderer (`js/page-actions.js`). An action takes `icon`, `disabled` and `busy` beside `key`, `label`, `href`, `variant` and `hint`; the new `newAction` (the same shape) is drawn first as the primary action; the new bar-wide `actionsCollapse` (`always`, `phone`, `tablet` or `none`, default `phone`) folds icon actions to the icon alone while the label stays the accessible name and tooltip. A press raises one `pk-action { key }`. Existing configs draw as before. The list toolbar, the wizard footer and grouped menus follow in later steps; `addLabel` and `pk-add` are deprecated in favour of `newAction` and removed after one minor.
