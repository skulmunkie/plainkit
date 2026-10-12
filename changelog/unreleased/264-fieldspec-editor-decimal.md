---
type: added
issue: 264
---
`pk-field-group` has a `custom` field kind whose body is your own content in the `editor-<key>` slot (no value, no part in the form), and Blazor gets `PkFieldSpec<TItem>.Custom` with `Editor` and `PkFieldSpec<TItem>.Decimal`, a number spec over a `decimal?` with invariant-culture text for the value and `Min`/`Max`/`Step`. Both come from the new `specMembers` and `fieldFactories` of the field-group mapping.
