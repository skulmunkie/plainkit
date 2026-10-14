---
type: added
issue: 1313
---
`pk-field-group` has a `datetime-local` field kind (a date and a time of day with no time zone; the value is text of the form `yyyy-MM-ddTHH:mm`), and Blazor has `PkFieldKind.DateTime` and `PkFieldSpec<TItem>.DateTime(key, label, get, set, min, max)` over a `DateTime?` property.
