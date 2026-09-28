---
type: added
issue: 271
---
`pk-image-gallery` gains a `hideAdd` prop (`HideAdd` in Blazor): editable, it keeps the per-tile make-primary, remove and reorder controls but skips drawing the add tile, so a host can supply its own add control elsewhere (a real Blazor `InputFile`, say) instead of reading `pk-add`, whose file list never carries the bytes.
