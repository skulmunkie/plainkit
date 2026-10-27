---
type: added
issue: 430
---
`pk-canvas` resizes the one selected item from the keyboard: Ctrl (Cmd on a Mac) with an arrow moves its bottom-right corner by one grid step, Shift by ten, never below one step, through the same cancelable `pk-canvas-resize` event and announced as "Resized to W by H".
