---
type: added
issue: 261
---
`PkRecordEditor<TRecord, TForm, TKey>` in PlainKit.Blazor, the state of a create-or-edit record page: `LoadAsync(id)` or `StartNew()`, `NotFound`, DataAnnotations validation, `SaveAsync`, `DeleteAsync`, `Busy` and `Error`. An exception that implements the new marker interface `IPkUserFacingException` shows its message; any other is logged to the `ILogger` you pass and shown as a generic line. It pairs with `PkRecordForm`, and the `plainkit-blazor` skill has a `record-editor.md` reference.
