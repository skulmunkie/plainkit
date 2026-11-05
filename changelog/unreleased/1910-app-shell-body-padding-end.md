---
type: added
issue: 1910
---
`pk-app-shell` has a documented hook, `--pk-app-shell-body-padding-block-end`, for the padding under the last thing in the body, so a page with a floating launcher (a `pk-tray` launcher in the bottom corner) can keep its last row and pager clear of it. `flush` still removes all body padding.
