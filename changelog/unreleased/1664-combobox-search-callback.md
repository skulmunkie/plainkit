---
type: added
issue: 1664
---
`pk-combobox` has a `search(query, { signal })` callback property (like `load` on `pk-data-table`): its answer, a promise of `[{ value, label }]`, becomes the list, the client filter is off while it is set, and a newer query (or removing the element) aborts the `AbortSignal` while a late answer to a superseded query is dropped. `pk-combo-query` and `debounce` keep working. Blazor: `PkCombobox.OnSearch` (`Func<string, CancellationToken, Task<IReadOnlyList<PkFieldOption>>>`), whose token is cancelled by the element's abort through the existing callback slot.
