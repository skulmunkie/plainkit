---
type: added
issue: 219
---
A router module (`modules/router/router.js`, `mountRouter`) holds one route tree and derives the breadcrumb trail from the current path, and `createPage` takes it as `router` to set its breadcrumbs and title now and on every route change. Vanilla SDK only; a Blazor route-tree wrapper is a follow-up.
