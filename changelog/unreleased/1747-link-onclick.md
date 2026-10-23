---
type: added
issue: 1747
---
`PkLink` has `OnClick` (`EventCallback<MouseEventArgs>`), raised for every click, `Href` links included, without changing the navigation (ctrl and middle clicks still open a new tab), so a flyout of links can close as one is followed. `pk-link` documents the native `click` event it already fires.
