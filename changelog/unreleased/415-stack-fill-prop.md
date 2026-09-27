---
type: added
issue: 415
---
`pk-stack` takes a `fill` prop: it fills a flex or grid parent with a definite height instead of sizing to its content, so a child declared to grow (a `pk-table` with `sticky-header`, for example) can own the scrolling instead of the page. The "Routed list and detail" template now uses it: the page titlebar, status tabs, search field and pager stay pinned while only the table's rows scroll, and it's a complete list-page reference (breadcrumb, titlebar action, filter tabs, search, sortable sticky header, pagination).
