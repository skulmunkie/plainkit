---
type: fixed
issue: 59
---
`pk-table` raises `pk-select` once per click on a select checkbox, not twice (the native `change` and `input` events both reached the handler); a host that toggled its selection on each event no longer sees it flip back.
