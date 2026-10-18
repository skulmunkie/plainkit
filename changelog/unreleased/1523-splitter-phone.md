---
type: added
issue: 1523
---
On a phone, a `collapsible` side-by-side `pk-splitter` starts with the end pane collapsed unless the host sets `collapsed` or a `persist-key` state is saved, and expanding it shows the end pane as a full-width row under the start pane (the toggle is a 44px icon-only target). A phone default is never written to storage. A change made before the `persist-key` store has loaded is no longer lost.
