---
type: added
issue: 1651
---
`pk-record-page` raises `pk-record-change` ({ key, value, values }) after each committed field change, and `PkRecordPage` exposes it as `OnFieldChanged`, so a card beside the fields (a summary, a preview) can follow the edits before Save.
