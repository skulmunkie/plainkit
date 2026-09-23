---
type: fixed
issue: 212
---
`pk-app-shell` finds its `pk-side-nav` even when a host framework wraps it (a Blazor component's generated `<span slot="nav">` for a multi-root `RenderFragment`). Before this, the nav drawer's `open` state silently never changed on a phone: the shell toggled its own `nav-open` attribute, but the direct assigned element (the wrapper span, not the side nav) had no `open` to set, with no error.
