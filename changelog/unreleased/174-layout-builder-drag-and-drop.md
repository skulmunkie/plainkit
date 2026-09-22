---
type: changed
issue: 174
---
The layout builder (`mountLayoutBuilder`) gets pointer and touch drag-and-drop: dragging a row's handle reorders the top-level page, and dragging a palette element onto the canvas inserts it there, slot-aware when it lands on a container. Undo and Redo are icon-only buttons, each canvas element gets an Edit/Delete icon chip on hover or selection, and at phone width the toolbar row is hidden entirely (touch drag and the chip are the whole interaction model, with Ctrl+S still saving from an attached keyboard). `core/icons.svg` gains `undo`, `redo`, `edit` and `trash` symbols for this. Reordering inside a container stays keyboard/toolbar-only (Alt+arrows, Out/In), and Duplicate/Wrap stay toolbar/keyboard actions rather than more icons.
