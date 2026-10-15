---
type: fixed
issue: 1372
---
An app page no longer shifts when its elements upgrade early or late: a `pk-breadcrumb` keeps its one-row height before it upgrades and before its crumbs are set, and a `pk-list-page` keeps the height of its table's loading state until the table upgrades.
