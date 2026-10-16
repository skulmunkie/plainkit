---
type: fixed
issue: 1406
---
The `pk-close` event of `pk-select-menu` is declared cancelable in the element's API (it always was: `preventDefault` keeps the list open), so the API reference and the generated Blazor `OnClose` callback now say so; a .NET callback cannot cancel it.
