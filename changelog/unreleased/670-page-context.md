---
type: added
issue: 670
---
mountApp now resolves one page context (`pageContext` in `js/app/nav.js`: current row, branches to open, crumbs and title) and feeds the side nav, the breadcrumb and the document title from it, instead of each deriving its own answer; an explicit override (`ids`, `crumbs`, `title`) wins field by field over the URL default.
