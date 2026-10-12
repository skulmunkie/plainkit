---
type: added
issue: 264
---
`pk-field-group` takes a `commit({ key, value, values })` callback: the field is busy while it is pending, a newer edit replaces a pending one (a stale answer changes nothing), a rejection or a returned string is that field's error with the typed text kept, and `pk-field-change` is raised only after it succeeds. Blazor: `PkFieldSpec<T>.Async(key, label, get, setAsync)` (`SetAsync`) uses it, and `ModelChanged` follows a successful async set; `PkFieldGroupTesting.CommitAsync` now returns the field error a throwing `SetAsync` would show.
