---
type: fixed
issue: 640
---
`pk-table` no longer crashes when a row's key contains a character such as `"` that would otherwise break the internal slot-name selector (the slot lookup is now `CSS.escape`d), so a table backed by free text (a devtools warnings log, for example) can never take down the page.
