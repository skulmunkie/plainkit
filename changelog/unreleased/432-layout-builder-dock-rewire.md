---
type: changed
issue: 432
---
The layout builder (`mountLayoutBuilder`) is built on `pk-dock`: Palette, Structure and HTML are tabs of the left group, the canvas is the center and Properties the right, and each panel can be resized, moved, closed and reopened. Its button toolbar row is replaced by File (Save, only with `onsave`) and Edit menus in the dock toolbar, each item showing its keyboard shortcut and running the same action as the key. Right click (or Shift+F10, or a long press) on a canvas element opens its element menu (duplicate, wrap, delete, move), and on a palette button offers Add. At phone width the dock becomes one tab strip with the menus still in its toolbar, so the floating Save button is gone.
