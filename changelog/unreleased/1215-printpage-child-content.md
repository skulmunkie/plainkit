---
type: fixed
issue: 1215
---
Blazor `PkPrintPage` takes `ChildContent` (the printed document) and `Toolbar` and `Title` fragments for its slots; before, the content was dropped.
