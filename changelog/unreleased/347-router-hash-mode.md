---
type: added
issue: 347
---
`mountRouter` (modules/router) has a hash mode, `mode: 'hash'`, for apps on static hosting: addresses are `#/<path>?<query>`. New options `guard` (allow, deny with status 403, or redirect to an app-relative path; anything but `true` denies), `aliases` (old addresses that keep working, params and query carried over) and `notFound` (a `*` route or a label; a hash-mode router always reports an unknown address as a 404 match). `navigate` refuses addresses that are not app-relative paths. `route-tree.js` adds `parseHash`, `buildHash`, `mapAlias`, `safeRoute` and `buildNavCrumbs` (breadcrumbs from a nav tree). Path mode is unchanged.
