---
type: fixed
issue: 1331
---
A `pk-menu-item` with an `href` now follows it as a link click, so a client router (Blazor's) navigates without reloading the document when a module is chosen in the picker; `PkApp` also sets the document title on the first render, so a deep link has a title (#1332).
