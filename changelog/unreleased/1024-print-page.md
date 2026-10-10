---
type: added
issue: 1024
---
`pk-print-page` and the `print` page type: a document that is the only thing that prints. On screen it is a paper-like sheet under a `toolbar` slot (flat on a phone); in print the toolbar, anything marked `data-screen-only` and the app shell's header, footer and nav are hidden, `size` and `margin` set `@page`, and cards, field lists and table rows are kept whole with the table header repeating on every page.
