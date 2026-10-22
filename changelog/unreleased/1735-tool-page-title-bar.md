---
type: fixed
issue: 1735
---
`pk-tool-page` draws a title bar from its config like the other page types: `heading`, `breadcrumb`, `actions` (an action without an `href` fires `pk-action`), `badges`, `actionsOverflow` and the home crumb keys, above the form; it has `badges` and `actions` slots. A tool page's `breadcrumb` used to draw nothing. Blazor: `PkToolPage` gains `BadgesContent`, `ActionsContent` and `OnAction`.
