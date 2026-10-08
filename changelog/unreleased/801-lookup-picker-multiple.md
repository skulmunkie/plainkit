---
type: added
issue: 801
---
`pk-lookup-picker` takes `multiple`: the popup table gets a checkbox column that survives paging and search (no select-all across pages) and stays open, the chosen rows show as removable chips, `values` holds the keys, `max` limits them, `pk-values-change` reports them and the form submits one entry per key. Labels of keys not on a loaded page come from `selectedLabels` or one batched `resolve(keys)` call.
