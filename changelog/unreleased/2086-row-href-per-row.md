---
type: added
issue: 2086
---
A list row can have no link: a row carrying `_href` null or empty is not a link and not clickable (no pointer, no tab stop), the list page type's `rowHrefTemplate` config may be a function returning an address or null, and `PkListPage` has `RowHrefOf` (`Func<TItem, string?>`), which wins over `RowHrefTemplate`.
