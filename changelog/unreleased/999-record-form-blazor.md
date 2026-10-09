---
type: breaking
issue: 999
---
Blazor `PkRecordForm` is now generated from `pk-record-form` and no longer hand-written. Parameters kept 1:1: `OnValid`, `OnCancel` (shows Cancel when set), `OnDelete` (shows Delete when set), `Busy`, `BusyText`, `Error`, `SaveLabel`, `DeleteLabel`, `SaveDisabled`, `ActionsInHeader`, `ChildContent`, `Sidebar`, `Actions`, `Tabs`. Changes and migration: (1) `ChildContent` is now your own `<form @onsubmit:preventDefault>`; the component no longer draws the form or the `PkStack` of cards, so wrap the cards in `<form @onsubmit:preventDefault><PkStack>...</PkStack></form>`. (2) `HeaderActions` is removed: with `ActionsInHeader` put your own Save button in the page header and call the new `await _form.SubmitAsync()` on an `@ref` (the `OnAfterRender` workaround is no longer needed). The generator gains the mapping options `shows` and `methods`.
