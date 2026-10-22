---
type: fixed
issue: 1726
---
A tall `before-list` region (`BeforeListContent` in Blazor) no longer squeezes a full-height list page to zero rows: the region shrinks and scrolls inside its own box (the new `before` part, which a `display: contents` Blazor wrapper cannot defeat) while the list keeps a floor of about three rows, tunable with `--pk-list-page-table-min`.
