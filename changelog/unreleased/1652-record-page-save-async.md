---
type: added
issue: 1652
---
`pk-record-page` has a `requestSave(skipBeforeSave)` method and `PkRecordPage` a public `SaveAsync(bool skipBeforeSave)` (there is no parameterless overload: the test helper `SaveAsync()` of `PkPageTesting` keeps its meaning): a confirmation a `BeforeSave` asked for resumes the save through the normal path (validation, busy state, dirty reset, switch to view) and learns whether it saved.
