---
type: added
issue: 353
---
The `doc` page type is built in: a route `page: 'doc'` (or `mountPage(box, { type: 'doc', config })`) mounts `pk-doc-page` with `config.items`, the item and heading taken from the route (`id` param, `anchor` query), your `loadItem(id, ctx)` and `href(id, anchor, ctx)` callbacks, and same-page links routed through `ctx.navigate`.
