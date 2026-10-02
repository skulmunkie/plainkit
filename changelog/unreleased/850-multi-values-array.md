---
type: added
issue: 850
---
pk-select (multiple) and pk-tag-input have a values array property (and a JSON values attribute) and their commit event detail carries values; the string value stays for forms. In Blazor, Values maps straight to it, so the C# comma-joining code is gone.
