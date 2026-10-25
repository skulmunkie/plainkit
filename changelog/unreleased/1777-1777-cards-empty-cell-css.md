---
type: fixed
issue: 1777
---
pk-table's phone cards leave out a text-only cell with nothing in it, label and all, so a sparse column no longer draws a dangling label; a slotted Cell template that renders nothing still draws its label and is tracked in a follow-up.
