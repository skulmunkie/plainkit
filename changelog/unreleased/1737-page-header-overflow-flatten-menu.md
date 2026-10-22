---
type: fixed
issue: 1737
---
`pk-page-header` `actions-overflow` flattens a `pk-dropdown` or `pk-card-menu` in the actions slot: its menu items become overflow menu items one by one (headers and dividers kept, label, description, disabled and danger carried over), and choosing one selects the original item, so `pk-select` / `OnSelect` fires.
