---
type: changed
issue: 1085
---
pk-image-gallery's add tile is now a pk-dropzone: the tile also accepts dropped image files (pk-add fires as before; a slotted InputFile receives the drop). The internal `file` part is gone; style the tile's box through `::part(add)::part(zone)`-style rules on the `add` part.
