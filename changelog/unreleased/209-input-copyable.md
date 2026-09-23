---
type: added
issue: 209
---
`pk-input` (and `PkInput.Copyable` in Blazor) gains a `copyable` prop: a copy-to-clipboard button next to the reveal toggle, disabled while the value is empty, that shows "Copied" for a moment and fails silently (logged, never a false "Copied") on an insecure origin or a denied permission.
