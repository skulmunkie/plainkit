---
type: added
issue: 1693
---
`pk-tree-item` takes an `href` (Blazor: `PkTreeItem Href`): the label becomes a real link, so middle-click, copy-link and the status-bar address work, the selected row carries `aria-current="page"`, and a plain click is reported as a cancelable `pk-navigate` (Blazor: `OnNavigate`) for the app router, like `pk-link`. Tree keyboard navigation is unchanged.
