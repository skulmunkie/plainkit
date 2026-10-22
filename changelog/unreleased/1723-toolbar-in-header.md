---
type: added
issue: 1723
---
`pk-list-page` config `toolbarInHeader` puts the breadcrumb and heading in the toolbar row with the search box, Filters and the actions (one row, wrapping on a phone), through the new `lead` slot of `pk-data-table`; the page-shell title bar is then not drawn, so there is no pk-page-header (no sticky header, no back link). Blazor: `PkListPage ToolbarInHeader`.
