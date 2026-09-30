---
type: changed
issue: 741
---
`scripts/ui-review.mjs --shard i/n` reviews one disjoint slice of the selected elements and scenarios, and the CI UI review runs as four parallel shards, each keeping its screenshots as the artifact `ui-review-1` to `ui-review-4`.
