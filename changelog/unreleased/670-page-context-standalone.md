---
type: added
issue: 670
---
`js/page-context.js`: `createPageContext({ router, routes, nav })` gives a page outside `mountApp` the same `{ ids, section, current, crumbs, title }` that `mountApp` computes, with a route node's `context` and `ctx.set(override)` as overrides, and `bindPageContext(ctx, { nav, header, breadcrumb, title })` writes it onto the side nav rows, page header, breadcrumb and document title as plain attributes. No element reads it, and `mountApp`'s entry does not load it.
