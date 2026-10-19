---
type: added
issue: 1601
---
`PkRecordPage` takes `BeforeSave` (`Func<TItem, Task<bool>>`), and `pk-record-page` a `beforeSave(values)` property (the record page type `config.beforeSave(values, ctx)`): it runs once the form is valid and before `Save`, and returning false stops the save and keeps the page in edit mode with the edits, for a confirm of your own. (Step 3 of #1601.)
