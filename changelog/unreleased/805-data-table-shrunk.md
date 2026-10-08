---
type: changed
issue: 805
---
`PkDataTable<TItem>` sends its options to `pk-data-table` as plain props (and `AddLabel` as the element's `add-label` button, `OnAdd` as its `pk-add`) instead of building a `config` JSON and a `PkButton` itself. Its parameters and behaviour are unchanged; the rendered element no longer carries a `config` attribute, and the add button is drawn by the element inside it.
