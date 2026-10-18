---
type: added
issue: 1552
---
`pk-record-page` and `PkRecordPage<TItem>` take field sections: `config.sections` (Blazor `Sections`, a list of `PkRecordSection`) draws one titled card per section in the main column, and the sidebar cards (`config.sidebar`, Blazor `Sidebar`) are editable field groups in edit mode, joined to the same form (one Save, one validation; a field a sidebar card names is edited there only). The page title can come from the loaded record: `config.titleField` on the element, `TitleOf` in Blazor (`config.title` is the fallback). Cancel raises the new `pk-record-cancel` event (Blazor `OnCancel`), and setting it (or `cancellable`) shows Cancel on a new record too.
