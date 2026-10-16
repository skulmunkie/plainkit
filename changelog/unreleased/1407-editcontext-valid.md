---
type: added
issue: 1407
---
A Blazor form control inside an `EditForm` now shows the element's `valid` state (through `IsValid`) once its field was changed and has no validation messages, next to the existing `invalid` state. `Warning` stays an explicit parameter: the EditContext has no severity.
