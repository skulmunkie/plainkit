---
type: added
issue: 1769
---
pk-input `type="search"` has `search-on="enter"` (`SearchOn="InputSearchOn.Enter"` on `PkInput`): `pk-search` then fires only on Enter and clear, never while typing, for a lookup or barcode box (no more huge `DebounceMs`). `OnSearch` from `PkInput` carries the text in `PkSearchEventArgs.Value`; `Query` is the field `PkTableFilters` fills.
