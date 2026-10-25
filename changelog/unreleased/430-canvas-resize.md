---
type: added
issue: 430
---
A selectable `pk-canvas` (Blazor `PkCanvas`) draws eight resize handles on a single selected item (each with a 44 px hit area; drawn size `--pk-canvas-handle-size`). Dragging one asks for the item's new world rect through the cancelable `pk-canvas-resize` event (`OnResize`): Shift keeps the aspect ratio on a corner, Alt resizes about the centre, Escape puts it back. The page writes the rect back; `readonly` hides the handles.
