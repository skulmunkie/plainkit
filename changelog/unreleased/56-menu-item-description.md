---
type: added
---
`pk-menu-item` takes a `description` attribute and a `description` slot: a muted, smaller line under the label that wraps inside the menu width (also on a phone) and is the item's accessible description (`aria-description` through ElementInternals, hidden from the name, the typeahead text and the `pk-select` value); keep it to one short sentence. `PkMenuItem` gets `Description` and `DescriptionContent` (issue #56).
