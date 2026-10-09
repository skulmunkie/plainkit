---
type: added
issue: 999
---
New `pk-record-form`: the page layout of a create-or-edit record around your own `<form>`. A toolbar (Cancel, your actions, Delete, Save; the buttons fold to icons on a phone), optional tabs, an error alert, the form inside `pk-form` (a summary of the problems, focus on the first, form-associated `pk-field-group` included) and an optional sidebar. It raises `pk-record-save` once the form validates, `pk-record-cancel` and `pk-record-delete`, and `submit()` does what Save does for a button in the page header. State, saving and toasts stay with the page. The Blazor `PkRecordForm` becomes a generated wrapper of it in a follow-up step.
