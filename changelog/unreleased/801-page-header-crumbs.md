---
type: added
issue: 801
---
`pk-page-header` draws its own breadcrumb: `crumbs` (a JSON array of `{ "label", "href" }`; the last is the current page, and the page title when no `heading` is set), `breadcrumb-label`, `home-href` with `home-label` and `home-icon` (an icon-only home link first in the trail) and `back-link` (a "Back to <parent>" button above the header, to the last crumb before the current one that has a usable address). An address that is not a same-site path, http(s), mailto, tel or sms draws a crumb without a link. In Blazor `PkPageHeader` sends its typed `Crumbs` list as that attribute instead of building the trail, home crumb and back link in Razor (same parameters; the trail is now in the element's shadow tree, so a test or style that looked for a `pk-breadcrumb` in the page DOM reaches it through the element's `trail` part).
