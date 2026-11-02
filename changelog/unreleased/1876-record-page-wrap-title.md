---
type: added
issue: 1876
---
`pk-record-page` takes `wrapTitle` (also `config.wrapTitle`; Blazor `PkRecordPage` `WrapTitle`): it draws the compact record strip and lets a long title wrap to at most three lines on a phone. `pk-page-shell` forwards `variant` and `wrap-title` to its header (Blazor `PkPageShell` `Variant`, `WrapTitle`).
