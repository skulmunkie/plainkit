---
type: added
issue: 804
---
`PkSelect` (with `Multiple`) and `PkTagInput` bind a typed list: `@bind-Values` (`IReadOnlyList<string>`, `ValuesChanged`, and `ValuesExpression` for an `EditForm`), so a value containing a comma round-trips; `Value` is unchanged. A mapping opts in with `"multi": true` in its `model` block.
