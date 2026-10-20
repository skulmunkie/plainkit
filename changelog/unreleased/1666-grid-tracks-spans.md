---
type: added
issue: 1666
---
`pk-grid` (Blazor `PkGrid`) takes `tracks`, an explicit column track list as CSS writes it (`repeat(12, minmax(0, 1fr))`, `minmax(0, 1.5fr) minmax(0, 1fr)`), and any child can carry `data-col-span` (2 to 12) and `data-row-span` (2 to 4), so a dashboard of 3, 4, 6 and 12 column widgets needs no hand-written `display: grid` rule. A phone falls back to auto columns and ignores the spans. Uneven proportions were already `ratio="1.5:1"`.
