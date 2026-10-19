---
type: added
issue: 1599
---
`PkRecordPage` takes `IsUserFacing` (`Func<Exception, bool>`), as `PkRecordEditor` does: a `Load` or `Save` exception it accepts shows its own message instead of "Something went wrong", so an app whose domain exception base cannot implement `IPkUserFacingException` needs no wrapper around each delegate.
