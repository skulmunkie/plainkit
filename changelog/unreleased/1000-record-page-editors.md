---
type: added
issue: 1000
---
`pk-record-page` shows a custom field (kind `custom`) in edit mode from the host child `slot="editor-<key>"`, and Blazor's `PkRecordPage<TItem>` renders a `PkFieldSpec`'s `Editor` template there, so a record's edit form can mix typed fields with your own controls.
