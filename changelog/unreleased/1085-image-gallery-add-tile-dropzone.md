---
type: breaking
issue: 1085
---
pk-image-gallery's add tile is now a pk-dropzone: the tile also accepts dropped image files (pk-add fires as before; a slotted InputFile receives the drop). The internal `file` part is removed (a documented part, so an API break). Migration: a rule that styled `pk-image-gallery::part(file)` now targets the dropzone's input through the add tile, `pk-image-gallery::part(add)` (the tile is a pk-dropzone; its own input is that element's `control` part, its box `zone`); the hidden file input needs no styling of its own.
