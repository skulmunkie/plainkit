---
type: added
issue: 518
---
`plainkit audit` gains the P family (P1-P9): pages and app structure, flagging ad hoc HTML entry pages instead of `mountApp`, a `mountApp` with no `defineModule` modules, a hand-built mount where a built-in page type fits, hand-built chrome beside `pk-app-shell`, hand-built list/record states, state or navigation bypass (`localStorage`, `location.hash`), missing empty/error/loading handling, unknown page-type ids, and hand-written hash-route links.
