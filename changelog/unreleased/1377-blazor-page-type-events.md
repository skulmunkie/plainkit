---
type: added
issue: 1377
---
The Blazor page-type components raise their title-bar `OnAction` (dashboard, master-detail, record, settings, wizard, workspace pages), `PkRecordPage` adds `OnDirty` and `OnSave`, `PkWizardPage` adds `OnDirty`, `OnSubmit` and a `Submit` callback (with inline `errors`), and `PkToolPage`, `PkNotFoundPage` and `PkStatesPage` take a `TitleContent` slot.
