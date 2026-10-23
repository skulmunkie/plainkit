---
type: added
issue: 1721
---
`pk-heat-map` phase 3: `group-by` (`GroupBy`) draws one level of grouping, where an item with `children` (`PkHeatItem.Children`) becomes a framed area with its name and total in a header, sized by the sum of its children and holding them as boxes (each child's name carries its group, and the data table reads "Group / child"). Activating the merged "Other" box now also opens its members as a table over the map, inside the element so its height never changes; Escape or Close returns focus to the box, and cancelling `pk-heat-select` stops it opening.
