---
type: fixed
issue: 1716
---
A `pk-loading-overlay` with `fill` keeps a wrapped list page pinned (header row, bulk bar and pager stay, only the rows scroll) when its parent is a block of definite height, such as the `<main>` the Blazor `PkApp` draws in a `pk-app-shell[contain]` body: the overlay is now capped to its parent height, where it grew to the 50 rows before.
