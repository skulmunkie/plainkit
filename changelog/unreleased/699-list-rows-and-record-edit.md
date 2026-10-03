---
type: fixed
issue: 699
---
In an app, the rows of a `list` page now open their record on a click (they were drawn as not clickable because the data table's inner table loads on demand and lost the setting), and the `record` page no longer rebuilds its form when the first edit marks it dirty, which discarded what was typed so that Save sent the old values.
