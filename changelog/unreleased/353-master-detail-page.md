---
type: added
issue: 353
---
`pk-master-detail-page` and the `'master-detail'` app-framework page type: a filterable list beside the record the route selected (one pane at a time with a Back button on a phone), so a deep link to a record works. Your `load(query)` feeds the list, `mountDetail(pane, id)` draws the record; the page shows the built-in loading and error states around it, moves focus to the record, and returns it to the row on Back.
