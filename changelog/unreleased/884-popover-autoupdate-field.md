---
type: fixed
issue: 884
---
`pk-popover`, `pk-combobox`, `pk-dropdown`, `pk-select-menu` and `pk-badge-popover` no longer throw `this.$u is not a function` when a property was written to the element before it was defined and the element is then removed: their panel auto-update no longer shares a field with the base class's pre-upgrade bookkeeping.
