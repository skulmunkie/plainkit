---
type: fixed
issue: 136
---
`pk-tree` keyboard navigation is fast at scale again: the visible-node list is cached and rebuilt only on an expand, collapse or slot change, and the roving tabindex moves between the current item and the next instead of rewriting every item, so an arrow key on a 5,000-item tree drops from about 25 ms to under 1 ms at the median.
