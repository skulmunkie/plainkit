---
type: fixed
issue: 1851
---
A pk-tree no longer widens its column when an item label is very long: the tree keeps the width of its container and the long label is cut off inside it (with `wrap-labels` it wraps).
