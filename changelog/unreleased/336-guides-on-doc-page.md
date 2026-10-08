---
type: changed
issue: 336
---
The Guides page is a `pk-doc-page`: the same guides, search of the guide texts (with its status line), breadcrumb, table of contents, previous and next links, deep links and back and forward, drawn by the element instead of the page's own layout and stylesheet. The breadcrumb now sits above the title rather than in a bar, a missing guide shows the element's "Not found" state, and the nav search no longer marks which guides matched by title or by text in the list (the status line says it). `pk-doc-page` takes `config.scroller` (a selector): the host's own scrolling box, which the table of contents and heading links follow instead of the page.
