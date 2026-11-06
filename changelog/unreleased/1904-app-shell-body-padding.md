---
type: added
issue: 1904
---
`pk-app-shell` has a documented hook, `--pk-app-shell-body-padding-block-start`, for the padding above the first thing in the body. Set it to `0px` (or a smaller step) on the shell or an ancestor to tighten the band above a record page header; the sticky page header offset follows, and `flush` still removes all body padding.
