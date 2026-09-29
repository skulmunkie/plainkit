---
type: breaking
issue: 648
---
`pk-app-shell` no longer has a `title` slot or `title` part: app-shell is app space, not page space, and never carried a title concept of its own. A `<h2 slot="title">` (or similar) previously placed in the shell's header must move into the page's own `pk-page-header` in the body — that is the only place a page title belongs now.
