---
type: added
issue: 853
---
`PlainKit.Blazor.Testing` gives component tests of pages that use `PkDataTable<TItem>` a supported seam: `await cut.Instance.LoadAsync()` runs `Load` the way the element does (optionally for a given `PkListRequest`) and renders the rows and `Cell` output, and `await cut.Instance.ClickRowAsync(id)` raises the row click so `OnRowClick` gets the item. No reflection over internal types, no new package.
