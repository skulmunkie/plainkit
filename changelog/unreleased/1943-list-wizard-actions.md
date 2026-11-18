---
type: changed
issue: 1943
---
The list page toolbar and the wizard footer draw their buttons with the same renderer as the title bar. `pk-list-page` takes `toolbarActions` (the older `actions` still works) and `newAction` (drawn first, primary) in the one item shape, `actionsCollapse` folds icon buttons for the whole toolbar, and a press raises `pk-action { key }`; an item with only a label takes its label as its key. `addLabel` and the `pk-add` event are deprecated in favour of `newAction` (a warning is logged once; `pk-add` also raises `pk-action { key: 'new' }`) and go after one minor, and a per-item `collapse` is a deprecated override. The wizard footer looks and behaves as before: `footerActions` and `pk-wizard-action { key, values, step }` are unchanged, and `pk-action { key }` is raised after it.
