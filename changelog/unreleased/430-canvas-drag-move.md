---
type: added
issue: 430
---
A selectable `pk-canvas` moves its selection when you drag an item that is already selected (mouse, pen or one finger): `pk-canvas-move` streams the new world positions with `done: false` and ends with `done: true`; Escape puts the items back. Writing the positions back to the items stays the page's job; `readonly` turns dragging off.
