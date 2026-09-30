---
type: breaking
issue: 708
---
`pk-page-header` (and `PkPageHeader`) collapses the crumb trail, the default-slot content and the actions onto a single row by default whenever no explicit `heading`/`Title` is set, for every `variant` — not just `record`. A consumer relying on the old multi-row breakdown (a breadcrumb row, then a title bar with actions, then the note line) as the `page`/`section` default must now set the new `spacious` attribute (`Spacious="true"` in Blazor) to keep it; it stays useful for a title too long to share a row with the actions, or more badges than fit one row.
