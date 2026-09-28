---
type: changed
issue: 423
---
`pk-settings-page` and `pk-dashboard-page` accept an optional title bar in `config` (`heading`, `breadcrumb`, `actions`; an action without an `href` fires `pk-action`), drawn by the shared page shell (`js/page-shell.js`, with the tabs the dashboard already had). `pk-tool-page` and `pk-settings-page` build their fields with one shared builder, so a tool's inputs now also accept `switch` and `range`.
