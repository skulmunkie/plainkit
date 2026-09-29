---
type: changed
issue: 659
---
`pk-tabs`' `scroll` boolean prop is replaced by a single `overflow` enum (`scroll` | `menu` | `wrap`), and the old default (wrapping onto more rows when the tabs do not fit) is now the explicit opt-in `overflow="wrap"`; the new default, `overflow="scroll"`, is one row that slides. A page that set `scroll` needs `overflow="scroll"` instead; a page that relied on the old wrapping default needs `overflow="wrap"`.
