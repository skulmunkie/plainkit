---
type: added
issue: 1552
---
`pk-record-page` config takes `sections` (`[{ heading, fields: [keys] }]`): titled cards in the main column in edit mode and titled field lists in view mode, after the fields no section lists. It raises `pk-record-cancel` when Cancel is pressed (`OnCancel` on `PkRecordPage`), and `PkRecordPage` has `TitleOf` (`item => title`), applied as the page title once `Load` has returned and again after a save.
