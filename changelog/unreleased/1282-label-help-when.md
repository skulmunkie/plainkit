---
type: added
issue: 1282
---
A field spec of `pk-field-group` takes `labelWhenExpr` and `helpWhenExpr`: conditional text for the label and the help tooltip that follows the live values with no server round trip, written `cond ? 'text' : cond ? 'text' : other` (a value is a quoted text or another field's key, for example `status == 'paid' ? 'Paid on' : 'Due on'`); an empty answer keeps `label` or `help`. They use the same lazy evaluator as the other conditions. In Blazor they are the string members `LabelWhenExpr` and `HelpWhenExpr` of `PkFieldSpec<TItem>`; the typed `LabelWhen` and `HelpWhen` stay the load-time form.
