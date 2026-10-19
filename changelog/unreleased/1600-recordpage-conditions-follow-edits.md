---
type: fixed
issue: 1600
---
`pk-record-page` / `PkRecordPage`: a declarative condition (`WhenExpr`, `DisabledExpr`, `ReadonlyExpr`, `RequiredExpr`, `LabelWhenExpr`, `HelpWhenExpr`) now follows an edit made in another card or the sidebar, so one select can show, hide or disable fields in other sections. `pk-field-group` conditions may also name a value the host gave that the group does not draw. The typed `When`, `Disabled` and `ReadOnly` functions are still read per load and save; the docs say to use the `*Expr` members for a condition that follows edits.
