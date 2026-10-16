---
type: added
issue: 1461
---
`pk-tabs` takes `tab-param` (Blazor `TabParam`): the tab named by that query parameter is selected on load (it wins over `value`; an unknown or disabled value is ignored) and a change is written to the address with `history.replaceState`, so a page that draws its own tabs keeps the tab in the URL without a router navigation or a server render. `pk-detail-layout` and `pk-record-form` now share one helper for it.
