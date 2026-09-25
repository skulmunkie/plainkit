---
type: added
issue: 293
---
`PkRecordEditor` has an optional `IsUserFacing` predicate (`Func<Exception, bool>`, an init property) that decides which exceptions show their own message in addition to the `IPkUserFacingException` marker, so a domain layer that must not reference PlainKit.Blazor needs no wrapper around save and delete.
