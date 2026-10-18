---
type: fixed
issue: 1549
---
`PkListPage` typed `Columns` honour `Text` (and the property-name fallback) like `PkDataTable` instead of drawing empty cells, and `pk-list-page` lays rows out as cards below 640px (`hidePhone` and `title` columns apply) instead of a sideways-scrolling table; `config.cards` overrides it, and a selectable list keeps the table by default because a card has no select-all.
