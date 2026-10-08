---
type: added
issue: 873
---
The `list` page type takes `selectable`, `rowKey` and `bulkActions` and forwards them to its data table: `pk-list-page` raises `pk-select` (`{ selected, scope, query }`) and a new `pk-bulk` (`{ action, selected, scope, query }`) when a bulk button is pressed, and the page config callbacks `onSelect(detail, ctx)` and `onBulk(detail, ctx)` receive them (a promise from `onBulk` reloads the list and clears the selection). `PkListPage` gains `OnSelect` and `OnBulk`; the routed list template shows an Archive bulk action.
