---
type: added
issue: 1407
---
PkLookupPicker takes `Description`, `SearchDebounce` and the native `OnInput` and `OnChange` events (`ChangeEventArgs`), as the other form controls do. They come from a new generator feature: a hand-written ("existing") mapping can mark parameters `"extra": true` and the generator writes them into a partial companion class, so a hand-written component can gain parameters without growing.
