---
type: added
issue: 527
---
`pk-field-list` takes a data-driven `items` property (`{ label, value, hidden?, href? }[]`, text-only values), rendered as `dt`/`dd` alongside any slotted ones; a row with an empty value hides itself unless `showEmpty` is set (#207). Blazor's `PkFieldList` gets matching `Items` (`PkFieldListItem`) and `ShowEmpty` parameters.
