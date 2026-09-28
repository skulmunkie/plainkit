---
type: added
issue: 432
---
Adds `pk-dock` (step 1 of the dockable workspace): panels (any element with `slot="<id>"`, `data-heading`, `data-group`) laid out as a tree of resizable splits and tab groups, resized by pointer or the separator's arrow keys, drawn as one tab strip on a phone. The arrangement is a validated JSON `layout` document and `pk-layout-change` reports each change. The pure tree logic (`js/dock-model.js`: resize, activate, move, dock, serialise and restore) is node-tested. Blazor gets `PkDock`; moving panels by menu or drag, floating, collapse, saved layouts and undo come in later steps.
