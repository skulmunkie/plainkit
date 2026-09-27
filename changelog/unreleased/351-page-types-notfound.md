---
type: added
issue: 351
---
Adds `pk-not-found-page`, a presentational "this page doesn't exist" or "you don't have access" screen (works with zero config, or `heading`/`description`/`label` and a `pk-action` event for a "Go home" button), and its `'not-found'` app page type. Adds `mountPage(container, page, options)`: mounts a single page type (built-in, app-registered, or `{ type, config }`) into a container with no `defineModule`/`mountApp` around it, for a consumer who wants exactly one page; returns `{ destroy() }`.
