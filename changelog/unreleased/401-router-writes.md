---
type: changed
issue: 401
---
The Gallery and the Guides page write every address (view links, paging, the filter forms, a heading permalink) through the router instead of `location.hash` and `history.pushState`; addresses and back and forward behave as before.
