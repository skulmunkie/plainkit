---
type: added
issue: 1719
---
`PkPageTesting.ResumeSaveAsync(page)` resumes a record-page save without running `BeforeSave` again, so a confirm-then-resume flow can be tested in bUnit (it is not a `SaveAsync(skipBeforeSave)` overload: the page's own `SaveAsync(bool)` would win that call).
