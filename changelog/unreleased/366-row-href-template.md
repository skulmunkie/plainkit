---
type: added
issue: 366
---
`pk-table`, `pk-data-table` and `pk-list-page` take `row-href-template` (`/orders/{id}` or `#/orders/{id}`; `{id}` is the row key, any `{field}` a row field, URL-encoded): the first cell of each row becomes a real link (new tab, middle click, copy address) and a plain click goes through the app router with a cancelable `pk-navigate`, so a routed list-to-record table needs no navigation code. `PkListPage<TItem>` gets `RowHrefTemplate`; `OnRowClick` stays for an imperative handler, and the list page type of the app framework accepts `rowHrefTemplate`.
