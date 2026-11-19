---
type: added
issue: 2011
---
A wizard step can be drawn from `pk-field-group` field specs (`specs`) instead of `fields`, so steps whose fields depend on each other work: a new `optionsBy: { field, map }` on a select or combobox spec swaps its options when another field changes (and replaces an answer that is no longer listed), next to `whenExpr` and `requiredExpr`. The answers are collected, validated, marked inline, live-validated and reviewed like any wizard field. In Blazor, `Config` takes the same JSON.
