---
type: fixed
issue: 1778
---
The generated element methods (`PkListPage.ReloadAsync`, `ShowAsync`, `FocusAsync`, ...) do nothing when called during the static prerender instead of throwing the JavaScript interop error, so a page that reloads its list from `OnParametersSetAsync` (a query-string filter on a direct load) no longer shows the error UI; the interactive render loads with the current filters.
