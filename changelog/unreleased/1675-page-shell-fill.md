---
type: added
issue: 1675
---
`pk-page-shell` takes a `fill` option (Blazor `Fill`): the shell takes the height of its parent and its one content child takes what the header leaves, with no wrapper element or `:has` rule (page types step 6 of #1929).
