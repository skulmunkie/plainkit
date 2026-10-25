---
type: added
issue: 430
---
A selectable `pk-canvas` (Blazor `PkCanvas`) moves its selection with the arrow keys: one grid step, Shift ten, Alt one screen pixel, announced to screen readers. It asks through the new cancelable `pk-canvas-move` event (`OnMove`) with the new world positions; the page writes them back to the items, the canvas never moves them itself. `readonly` (`ReadOnly`) turns moving off. With something selected, Shift+arrow now moves it instead of reaching `pk-canvas-key`.
