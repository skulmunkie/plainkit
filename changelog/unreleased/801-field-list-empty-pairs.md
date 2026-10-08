---
type: added
issue: 801
---
`pk-field-list` hides a slotted `dt`/`dd` pair whose `dd` has no element and no text (an optional value), and shows it again when a value arrives; `show-empty` keeps empty pairs, as it already does for `items` rows. The element sets `hidden` on the pair and never removes a `hidden` the author set.
