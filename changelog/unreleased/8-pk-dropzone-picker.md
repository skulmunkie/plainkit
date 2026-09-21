---
type: added
issue: 8
---
`pk-dropzone` opens the file picker without a hidden native input: `pick()` for a host button of its own (called from a click or key handler; it opens the slotted input instead when there is one), and `browse-label` draws a real 44px button in the zone that is its one keyboard stop (`BrowseLabel` on `PkDropzone`).
