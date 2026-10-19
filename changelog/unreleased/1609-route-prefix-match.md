---
type: added
issue: 1609
---
A route or nav entry whose path ends in `/*` (`/stock/*`) owns that path and everything under it, so a record page such as `/stock/ledger/41` keeps the Ledger row current without listing every record route. Exact routes still win, then the longest prefix. It works in the router and `pageContext`, and the same way in `PkPageContext.Compute` and `PkNavModel.Locate`.
