---
type: added
issue: 1241
---
`pk-detail-layout` has `hide-tabs` (`HideTabs` in Blazor): the layout draws no section strip of its own and shows one `data-pk-section` at a time from `section` alone, so a strip docked in a sticky `pk-page-header` can drive it. `pk-page-header` declares `pk-tab-change` for its docked strip, and `PkPageHeader` has `OnTabChange`.
