---
type: added
issue: 1445
---
A table column can be flagged `title: true` (`Title = true` on a Blazor `PkTableColumn`): in the phone cards layout its cell becomes the card heading, with no label, the full width, start-aligned, wrapped and in heading weight. A column with an empty `label` no longer draws a label in a card either (`data-label` is omitted).
