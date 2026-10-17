---
type: added
issue: 1548
---
`PkListPage` has `ActionsContent` (the title bar) and `ToolbarContent` (beside the search box) for callback buttons and a `PkDropdown` overflow menu, and a `Config` action without an `href` raises the new `OnAction` (`pk-action` on `pk-list-page`, with the action's `key`); `pk-list-page` gains the `actions` and `toolbar` slots.
