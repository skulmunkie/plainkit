---
type: added
issue: 1421
---
`pk-table` and `pk-data-table` take `navigate="router|host|none"` to decide up front who follows a row link (`row-href-template`) on a plain click: `router` (the default, today's behaviour) raises the cancelable `pk-navigate` for the app router; `host` raises it as a non-cancelable notification, the router ignores it and nothing navigates, so the host navigates itself; `none` raises nothing and the browser follows the address. In Blazor `PkTable` and `PkDataTable` get `Navigate` (`"router"`, `"host"` or `"none"`) and `OnNavigate` (`EventCallback<PkNavigateEventArgs>`, a notification a .NET callback cannot cancel: set `Navigate` to `"host"` and call `NavigationManager.NavigateTo`).

`pk-link` takes the same `navigate` (`router`, `host`, `none`) for its `to` link, and `PkLink` gets `Navigate`.

`pk-list-page` takes `navigate` too (handed to its table), and `PkListPage` gets `Navigate`.
