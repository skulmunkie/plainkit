---
type: added
issue: 1389
---
Blazor: `PkDesignSurface.Selected`, `DropTarget` and `ChipFor`, `PkInput.Listbox` and `PkButton.Controls` take the id of an element, for the properties that hold an element reference. The generator has a new mapping kind, `"map": "ref"`, and the bridge resolves the id in the element's own tree after each render in which it changed.
