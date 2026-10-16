---
type: added
issue: 1421
---
`pk-table`, `pk-data-table`, `pk-list-page` and `pk-link` take `navigate="router|host|none"` to decide up front who follows a link on a plain click (a row link from `row-href-template`, or a `to` link): `router` (the default, today's behaviour) raises the cancelable `pk-navigate` for the app router; `host` raises it as a non-cancelable notification, the router ignores it and nothing navigates, so the host navigates itself; `none` raises nothing and the browser follows the address. In Blazor `PkTable`, `PkDataTable`, `PkListPage` and `PkLink` get `Navigate`, and `PkTable` and `PkDataTable` get `OnNavigate` (`EventCallback<PkNavigateEventArgs>`, a notification a .NET callback cannot cancel: set `Navigate` to `"host"` and call `NavigationManager.NavigateTo`).
