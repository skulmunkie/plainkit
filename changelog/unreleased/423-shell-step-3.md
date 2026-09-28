---
type: changed
issue: 423
---
`pk-record-page` (`title`, `breadcrumb`, `actions`), `pk-list-page` (`heading`, `breadcrumb`), `pk-wizard-page`, `pk-workspace-page` and `pk-master-detail-page` (`heading`, `breadcrumb`, `actions`) accept the optional title bar the settings and dashboard pages already have, drawn by the shared page shell (an action without an `href` fires `pk-action`). `pk-states-page`, `pk-not-found-page` and `pk-doc-page` draw their states through the shell too. Pages without the new config render exactly as before.
