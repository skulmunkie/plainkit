---
type: added
issue: 1523
---
`pk-code-view` has an opt-in `copy` button in its header that copies all lines (without numbers), fires `pk-copy` with `{ ok }` and announces "Copied" or "Copy failed"; the clipboard helper is now shared with `pk-code-block` (Blazor: `Copy`, `OnCopy`).
