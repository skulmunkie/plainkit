---
type: added
issue: 805
---
`pk-data-table` takes plain props besides `config`: `columns`, `page-size`, `page-size-options`, `sort`, `sort-dir`, `hide-search`, `search`, `search-label`, `search-debounce`, `pager-label`, `label`, `caption`, `empty`, `no-results` and `load-error`. A plain prop wins over the same key of `config` once it differs from its default (a value equal to the default falls back to `config`); `config` keeps working as the fallback and still carries `filters`.
