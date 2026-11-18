---
type: added
issue: 2010
---
`pk-sections-page` (page type `sections`, Blazor `PkSectionsPage`) is a read-mostly record page: the shared title bar with a primary action and an actions menu that folds on a phone, section tabs docked in the header, and a two-column layout of your own panels (`slot="section-<id>"`, with an optional `slot="side-<id>"` summary card), one section at a time and kept in the address with `tabParam`. It loads and saves nothing. The tab-to-section sync is the shared helper `bindSections` in `js/page-sections.js`.
