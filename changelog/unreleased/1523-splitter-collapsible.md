---
type: added
issue: 1523
---
`pk-splitter` can collapse its end pane: `collapsible` shows a toggle on the separator (Enter, Space and a double click on the separator work too), `collapsed` is the state, `toggle-label` names the button, and `pk-collapse-change` reports a user toggle. The size is kept, so expanding restores the exact width; the collapsed pane is inert. Blazor: `Collapsible`, `@bind-Collapsed`, `ToggleLabel` on `PkSplitter`.
