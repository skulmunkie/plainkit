---
type: changed
issue: 1906
---
`pk-field-group` with `layout="inline"` now honours a field's `cols` (twelfths of the row, as in the grid; Blazor `PkFieldSpec.Cols`), never narrower than 5rem, so a short quantity stays short beside a wide picker in an add-row. Fields without `cols` keep their 12rem width.
