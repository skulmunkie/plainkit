---
type: added
issue: 1656
---
Blazor: rendering a component whose optional package (extra) the app did not declare in `<PlainKitExtras>` or `o.Extras` now throws in Development with a message that names the extra and the fix, and logs one error per component type in other environments, instead of rendering an element that never upgrades with no server-side word.
