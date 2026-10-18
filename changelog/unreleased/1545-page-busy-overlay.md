---
type: added
issue: 1545
---
A `PageBase` page (and a `PkRecordEditor` given `PageBusy`) blocks its page body while a busy action runs, with no overlay markup on the page: `pk-app-frame` has new `busy` and `busy-label` properties that block the page slot (inert content, `aria-busy`, 150 ms delay, 300 ms minimum) and `PkApp` drives them from the scoped `PkBusyState`, so the nav and footer stay usable; a page that draws its own overlay overrides `BusyBlocksPage`.
