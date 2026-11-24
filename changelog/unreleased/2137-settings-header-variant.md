---
type: added
issue: 2137
---
The list, master-detail, record, sections, settings, tool, dashboard, wizard and workspace pages take `config.variant` (and `wrapTitle`), forwarded to the title bar, so `variant: "record"` draws the compact single-row header that `pk-record-page` uses. Blazor: `HeaderVariant` on `PkListPage`, `PkMasterDetailPage`, `PkRecordPage`, `PkSectionsPage`, `PkSettingsPage` and `PkToolPage`.
