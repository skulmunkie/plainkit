---
type: added
issue: 1785
---
A pk-list-page config action (and bulk action) takes `icon` and `collapse` (also through `PkListPage` `Config`): the button draws that SDK icon before its label and folds to the icon alone on a phone by default, keeping the label as its accessible name, so an Add action needs no "+" in its text.
