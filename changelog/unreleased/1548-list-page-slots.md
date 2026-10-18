---
type: added
issue: 1548
---
`pk-list-page` has an `actions` slot in its title bar and a `toolbar` slot at the end of its list toolbar, for a button or a menu wired to app logic (the `config.actions` entries stay plain link buttons). In Blazor, `PkListPage` gets `ActionsContent` and `ToolbarContent`.
