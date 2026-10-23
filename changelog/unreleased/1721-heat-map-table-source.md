---
type: added
issue: 1721
---
`pk-heat-map` phase 4: a plain `<table>` as the direct child is a data source (first cell the name, a link in it the `href`; the value is column 2 unless a header says value, count, total, size or amount; severity or status and intensity headers pick those columns; `data-value` on a cell and `data-id` on a row are honoured; editing the table redraws, and `items` wins when set). Adds bUnit tests for `PkHeatMap`, the `/lab/heat-map` sample page and a heat map section in the choosing guide.
