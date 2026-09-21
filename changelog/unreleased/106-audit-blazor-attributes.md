---
type: fixed
issue: 106
---
The Blazor components no longer put an inline event handler given as text (`AdditionalAttributes["onclick"] = "..."`, any `on*` name with a string value) on their element: Razor emitted it as an attribute, which runs as script on a page without a strict content security policy. Handlers given as a delegate or `EventCallback` are unchanged, as are `data-*`, `aria-*`, `id` and `class`.
