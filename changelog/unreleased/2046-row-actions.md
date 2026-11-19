---
type: added
issue: 2046
---
`pk-data-table` takes `rowActions`, and `pk-list-page` forwards it in its config: an icon action column pinned at the inline end, drawn from the shared action item (key, label, icon, variant, group, hint, confirm) with the row title in each accessible name. A press raises one `pk-action { key, id, row }`; a `warn` action asks for confirmation first; more than `rowActionsMax` (3) actions, or a grouped one, fold into a row menu; a row's `_actions` hides, disables or re-words an action as plain data. The Blazor typed surface follows in a later step.
