---
type: notes
issue: 395
---
The layout builder's Alt+arrow structural reorder (move a canvas element up, down, in or out) now runs on a new shared utility, `js/tree-reorder.js`, instead of hand-rolled logic local to the module. No visible change: the keys, the moves and the announcements are identical.
