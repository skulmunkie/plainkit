---
type: fixed
issue: 442
---
App shell chrome: breadcrumb links, the app-shell footer links, the expanded app-bar-search field and the badge-popover trigger all reach the 44px touch target on a phone; the nav-item count badge and the app-bar-search result sub-line and badge meet WCAG AA contrast on the dark theme; and a slotted-brand element opts out of the page's blanket link colour with a `dressesLinks` flag instead of `base.css` naming it by tag.
