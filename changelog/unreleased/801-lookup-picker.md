---
type: added
issue: 801
---
`pk-lookup-picker` (component): a select-style field for a long list whose popup holds a searchable, pageable `pk-data-table`, fed by the same `load(query)` callback. Picking a row sets `value` to its key (the form value) and shows its label (`labelKey`, `selectedLabels` or the `resolve(keys)` callback); the popup is built on the first open. Single selection; multiple selection follows. The field shows a chevron that turns over while the popup is open, and the invalid state draws the error colour on the border.
