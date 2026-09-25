---
type: fixed
issue: 272
---
`pk-detail-layout` defines the tab strip and the Next button it renders in its own shadow tree, so the phone tabs are styled tabs on a page that uses no `pk-tabs` of its own (they rendered as unstyled run-together text before). A new test requires every element that nests `pk-*` tags in its template to load them.
