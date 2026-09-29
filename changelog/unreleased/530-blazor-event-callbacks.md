---
type: added
issue: 530
---
PkPropertyGrid has an `OnPropertyChange` callback, PkButton an `OnToggle` and PkSplitButton an `OnMenuToggle`. Blazor mappings can now declare an `events` list to get a typed callback for every element event, and a `bind` with a `field` to make any parameter two-way from any event field.
