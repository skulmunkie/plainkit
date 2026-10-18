---
type: added
issue: 1523
---
`pk-splitter` has a `persist-key` attribute (`PersistKey` in Blazor): the committed `size` and `collapsed` are saved in local storage and restored on the next visit, re-clamped to `min` and `max`, unless the host sets `size` or `collapsed`. A storage failure is logged, never thrown.
