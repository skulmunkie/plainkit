---
type: added
---
`PkTable<TItem>` (#49), hand-written over `pk-table`: typed `PkTableColumn<TItem>` columns (`Text` for formatted text, `Cell` for a template rendered into the `cell-<id>-<key>` slot), `Items` with `IdOf`, `Manual` server mode, two-way `Sort`, `SortDirection`, `Filters`, `Selected` and `Expanded`, typed events (`OnSort`, `OnFilter`, `OnSelect`, `OnRowClick` with the item, `OnRowExpand`), `EmptyText`, `Loading`, `Expandable` with a `DetailTemplate`, and the toolbar, bulk, caption, empty and footer slots. Attributes down (JSON rows and columns rebuilt when the parameters are set, never per render), no JavaScript. `blazor/mappings/table.json` follows it; the last element without a component now has one.
