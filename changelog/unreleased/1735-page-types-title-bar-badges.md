---
type: added
issue: 1735
---
`pk-page-shell` forwards `sticky-from`, `tabs-from`, `home-href`, `home-label`, `home-icon`, `actions-overflow` and `overflow-label` to its `pk-page-header` and gains a `badges` slot; the built-in page types (list, dashboard, master-detail, settings) read `badges`, `actionsOverflow`, `overflowLabel`, `homeHref`, `homeLabel` and `homeIcon` from their config, so their title bar matches `pk-page-header` (#1734). Every page type also has a `badges` slot (Blazor `BadgesContent`), and `PkPageShell` gains the matching parameters.
