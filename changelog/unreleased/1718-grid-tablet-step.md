---
type: added
issue: 1718
---
`pk-grid` has a tablet step: `tablet-tracks` gives the column list at 1024px and below (spans halve, so 12 tracks become 6), and `stack-below="tablet"` stacks the grid there instead of at 640px. `PkGrid` gets `TabletTracks` and `StackBelow`.
