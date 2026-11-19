---
type: added
issue: 1943
---
Page actions can be grouped: items with the same `group` in `actions`, `toolbarActions` or a wizard's `footerActions` now draw as one menu button named for the group (a `pk-dropdown`) instead of separate buttons, drawn where the group's first item stands. Choosing an item raises the same `pk-action { key }`; `disabled`, `busy`, `hint` and `variant: "warn"` carry to the menu item. Row menus share the same menu item builder; their behaviour is unchanged.
