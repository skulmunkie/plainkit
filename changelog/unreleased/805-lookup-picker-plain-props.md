---
type: added
issue: 805
---
`pk-lookup-picker` takes plain props `columns`, `page-size` and `search-label` for its popup table besides `config`. A plain prop wins over the same key of `config` once it differs from its default (a value equal to the default falls back to `config`); `config` keeps working as the fallback.
