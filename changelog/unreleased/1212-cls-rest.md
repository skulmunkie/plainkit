---
type: fixed
issue: 1212
---
The app shell body reserves its scrollbar gutter (`scrollbar-gutter: stable`), so a page whose layout depends on its width no longer flips between two layouts when the scrollbar appears, and the gallery reveals a view only once its `pk-*` elements are defined and gives the `pk-gallery` playground a fixed height. Layout shift on the pk-page-shell, pk-workspace, pk-master-detail-page, pk-gallery and foundations pages falls to about 0.
