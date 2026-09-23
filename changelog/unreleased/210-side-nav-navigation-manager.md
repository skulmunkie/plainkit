---
type: added
issue: 210
---
`PkSideNav` tracks the app's current route itself: leave `CurrentPath` unset and it subscribes to `NavigationManager` (unsubscribing on dispose) instead of the host wiring `LocationChanged` by hand. Set `CurrentPath` explicitly to override it. `PkSideNav` is now a hand-written component (`blazor/mappings/side-nav.json`), the first in the package to hook Blazor's own router.
