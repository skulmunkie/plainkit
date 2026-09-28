---
type: added
issue: 353
---
`pk-workspace-page` and the `'workspace'` app-framework page type: nav, main and optional aside panes that scroll on their own (a tab strip on a phone). Your `mount(panes, ctx)` callback draws into the panes; the page shows the built-in loading and error states around it and calls your cleanup when it leaves.
