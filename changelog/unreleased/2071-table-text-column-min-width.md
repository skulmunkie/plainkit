---
type: fixed
issue: 2071
---
A wrapping text column in `pk-table` and `pk-data-table` keeps a minimum width of 8rem, so narrowing the table (the open filter panel with `filterPanelReflow`) scrolls it sideways inside its own container instead of squeezing the first column to a word or a character.
