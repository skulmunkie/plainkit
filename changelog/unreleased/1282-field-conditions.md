---
type: added
issue: 1282
---
A field spec of `pk-field-group` takes declarative conditions that follow the live values with no server round trip and no lost focus: `whenExpr` (or `when` as a string), `disabledExpr`, `readonlyExpr` and `requiredExpr`, for example `status == 'paid' && amount > 100` (field keys, text and number literals, `== != < <= > >=`, `in [a, b]`, `!`, `&&`, `||`, no function calls). The evaluator is a small module that loads only when a spec declares one. In Blazor the same four are string members of `PkFieldSpec<TItem>` (`WhenExpr`, `DisabledExpr`, `ReadonlyExpr`, `RequiredExpr`).
