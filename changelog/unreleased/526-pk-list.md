---
type: added
issue: 526
---
`pk-list` is a plain ordered or unordered prose list: `ordered`, `marker` (`auto`, `disc`, `decimal`, `check`, `none`), `gap` and `dense` props, with items as plain elements (never a raw `ul`, `ol` or `li`) that get a real `role=listitem` and a native browser marker.
