---
type: added
issue: 423
---
`pk-page-shell` (Blazor `PkPageShell`) is the frame of one page: a `pk-page-header` (crumbs, title, actions, docked tabs) above one content region, with a whole-page `state` (loading, empty, error, forbidden; Retry raises `pk-page-shell-retry`) that replaces the content, and the spacing between them built in. The built-in page types move onto it in a later step.
