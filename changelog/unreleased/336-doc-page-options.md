---
type: added
issue: 336
---
`pk-doc-page` takes three options for a documentation site: a search of your own (set the `searchItems(query)` property, which returns `{ ids, status }`: the nav then holds a search box that shows only the items you name, and a polite status line says what matched, for example from the text of the documents), `breadcrumb: true` in `config` (a `pk-breadcrumb` above the title: the home title as a link, then the current page) and `home.cards: true` (the home list as a grid of `pk-card`s). `config` also takes `navLabel`, `pagerLabel` and `searchLabel` to name the nav, the pager and the search box.
