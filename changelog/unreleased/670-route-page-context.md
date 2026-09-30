---
type: added
issue: 670
---
A module route can declare its page context: `context: { ids?, crumbs?, title? }` (or a function of `{ path, params, query }`) on a route of `defineModule` overrides the nav row, breadcrumbs and title that `mountApp` works out from the address, field by field, when the address alone is ambiguous. The address stays the zero-config default.
