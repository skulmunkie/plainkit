---
type: added
---
`pk-app-shell` gets a `title` slot in the top bar (the page's single `h1`, one line, truncated) and a back link: `back-href` (a same-site path or http(s) address; anything else is dropped with a warning) and `back-label` (its `aria-label`, default "Back"), rendered as a real link with an arrow, keyboard reachable, with a 44px target. `PkAppShell` gets `TitleContent`, `BackHref` and `BackLabel`. The Blazor `PkPageHeader` is built on these names (issue #54).
