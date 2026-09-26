---
type: fixed
issue: 371
---
Two overlapping `createPage().busy()` (or `PageBase.BusyAsync`) actions no longer collide: the first to finish used to clear the busy overlay while the other still ran. Each action now holds its own token and the overlay stays up until the last one ends; a failing action releases only its own token.
