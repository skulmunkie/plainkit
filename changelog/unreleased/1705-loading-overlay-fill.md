---
type: fixed
issue: 1705
---
pk-loading-overlay has a `fill` attribute (Blazor `Fill`): in a flex column of definite height it takes the height and passes it to the covered page, so a list page inside it keeps its pinned header row and pager and only the rows scroll.
