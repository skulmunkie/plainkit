---
type: added
issue: 1378
---
Blazor: state the element changes itself can be bound two-way: `@bind-Value` on `PkTabs`, `@bind-Expanded` and `@bind-Selected` on `PkTreeItem`, `@bind-Index` on `PkLightbox`, `@bind-Open` on `PkSelectMenu`, `PkContextMenu`, `PkSplitButton` and `PkNavbar`, `@bind-Month` on `PkCalendar` and `@bind-Pressed` on `PkButton`. `PkCalendar` now reads the `yyyy-MM` month its `pk-month` event reports.
