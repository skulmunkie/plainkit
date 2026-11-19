---
type: added
issue: 1956
---
`pk-list-page` with `toolbarInHeader` keeps what the title bar gave: the toolbar row stays pinned while the page scrolls (`--pk-list-page-sticky-top` offsets it under an app bar), and `actionsOverflow` (`phone`, `tablet` or `always`, with `overflowLabel`) folds the toolbar actions into one menu at that width, the same setting and shared action items as `pk-page-header`. The menu is a separate chunk loaded only then. Blazor: `PkListPage.ActionsOverflow`.
