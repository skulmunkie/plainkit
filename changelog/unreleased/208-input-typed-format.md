---
type: added
issue: 208
---
PlainKit.Blazor gains `PkInputFormat`, a static class with `FormatDate`/`ParseDate` and `FormatNumber`/`ParseNumber`/`ParseInt` helpers for `pk-input type="date"`/`type="number"`, so a page binding a `DateTime`, non-negative `decimal?` or `int` no longer re-derives the invariant-culture format/parse glue by hand; empty or invalid text always becomes `null` (or a documented fallback for `ParseInt`), never a stale value.
