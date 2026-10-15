---
type: added
issue: 1380
---
The Blazor components expose the lifecycle events the elements already raise: `PkTooltip` `OnShow` and `OnHide`; `PkDialog`, `PkDrawer`, `PkLightbox` and `PkSideNav` `OnOpen`; `PkSelectMenu` `OnOpen` and `OnClose`; `PkSortableItem` `OnSortableGrab`, `OnSortableDrag` and `OnSortableDrop`; `PkFrame` `OnFrameLoad` and `OnFrameResize`. They are generated from the mappings, so nothing changes for markup that does not use them.
