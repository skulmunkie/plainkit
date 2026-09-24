---
type: added
issue: 261
---
`PkRecordForm`, the page template of a create-or-edit record page in PlainKit.Blazor: a `PkForm` with a validation summary, a Cancel / `Actions` / Delete / Save toolbar under the breadcrumbs and above `Tabs`, an error alert, and the caller's `PkCard`s in the main column with an optional `Sidebar`. Cancel and Delete show only when `OnCancel` / `OnDelete` are set; `SaveDisabled`, `Busy` and `BusyText` control Save. The `plainkit-blazor` skill gains a `record-form.md` reference and a routed list-to-record-page recipe (`PkDataList` `OnRowClick` to `/x/{id}`, `/x/new`, save navigates back).
