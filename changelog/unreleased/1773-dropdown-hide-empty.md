---
type: added
issue: 1773
---
pk-dropdown has `hide-empty` (`HideEmpty` on `PkDropdown`): with no menu item to choose it draws no trigger. pk-card-menu and pk-page-header's actions overflow button do this always, and the header notices items that appear later, so a "more actions" menu of state-dependent actions disappears when none applies.
