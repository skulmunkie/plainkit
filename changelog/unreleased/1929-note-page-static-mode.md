---
type: added
issue: 1929
---
`pk-note-page` has a static slotted mode for server-rendered, JavaScript-optional sites: write your own markup as its children with no config and it renders in the default slot as written (nothing built, moved or changed), and the text is all there with JavaScript blocked. Same rule as `pk-doc-page` and `pk-master-detail-page`.
