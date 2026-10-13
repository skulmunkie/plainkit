---
type: added
issue: 364
---
`pk-app-frame` (shell tier) draws the whole app frame from data: header with brand, module picker, search and settings menu, a side nav built from `nav`/`currentId`/`trail`, the breadcrumb `crumbs` above the page, and a footer slot. It routes nothing (the host navigates); search is `pk-query`/`searchItems`/`pk-select` and the theme item raises `pk-theme-toggle`. The Blazor `PkApp` frame builds on its generated `PkAppFrame`.
