---
type: added
issue: 213
---
New `pk-app-bar-search` element, a search field for a shell's header row: a pill with a results panel on a wide screen; below the phone breakpoint it collapses to an icon button that expands to a full-width field with a close button. Typing raises `pk-query`, debounced (250ms by default); the host sets `items` with the results (the element never searches or fetches itself); choosing one raises `pk-select` and the host decides what happens (the element never navigates). It closes on Escape, when a containing `pk-app-shell`'s nav drawer opens, and on browser navigation, so two overlays never show at once. `PkAppBarSearch` is the Blazor wrapper, the second hand-written route-aware component after `PkSideNav` (#210): `Items` is a typed JSON attribute like `PkTable`'s `Columns`/`Items`, and it collapses itself on `NavigationManager` navigation.
