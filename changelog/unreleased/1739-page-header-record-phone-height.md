---
type: fixed
issue: 1739
---
`pk-page-header` titled by its crumbs keeps a record header to about two rows on a phone: the current crumb is one line with an ellipsis (the full text is its title), and a `pk-badge-popover` in the chips row is badge height, with its touch target drawn around it instead of making the row 44px. Inline actions that leave the crumbs under 11rem (two or more, measured) take their own row.
