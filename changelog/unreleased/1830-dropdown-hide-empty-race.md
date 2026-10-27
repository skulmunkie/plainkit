---
type: fixed
issue: 1830
---
A pk-dropdown with `hide-empty` no longer shows its trigger for a menu holding only a header or divider when it connects before pk-menu-item is defined: the item type is read from the attribute, so the menu reads the same before and after the upgrade.
