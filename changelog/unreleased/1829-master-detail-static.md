---
type: added
issue: 1829
---
`pk-master-detail-page` has a static slotted mode for server-rendered, JavaScript-optional sites, following the convention of `pk-doc-page`: write your own list as a child with `slot="list"` (for example a `nav` of links) and the record as a child with `slot="detail"`, with no `config.list`, and the page lays them out as written, side by side wide and one pane at a time on a phone (the record when you wrote `record-id`, else the list). The current row is the one you mark (`aria-current`); the element never creates, moves or changes your elements, and `config`, `load`, `open`, `close` and `mountDetail` do nothing in this mode. With JavaScript blocked your links and text are all visible: `pk-master-detail-page` and `pk-doc-page` no longer hide themselves until upgraded, so a static page is not invisible before its script loads. This finishes the static slotted pages work.
