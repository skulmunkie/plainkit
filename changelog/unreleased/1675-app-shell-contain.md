---
type: added
issue: 1675
---
`pk-app-shell` has a `contain` option (`Contain` on `PkAppShell`): the body becomes a named inline-size container (`@container page (...)`, rename it with `--pk-app-shell-container`), clips sideways overflow, and any single slotted child fills the height, so a list page or a fixed region plus a scrolling one needs no wrapper element and no `:has()` rule. Off by default, composes with `flush`. First step of the fill-height regions design.
