---
type: fixed
issue: 1589
---
A max length set on a Blazor `PkFieldSpec` now reaches the field group's control (it was sent as `maxLength`, which the element does not read); `PkFieldSpec` also gains `MinLength`.
