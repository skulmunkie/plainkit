---
type: fixed
issue: 1427
---
Choosing a command in a `PkCommandPalette` no longer navigates `PkApp` to `/<id>`: the palette stops its `pk-select` at its own component (mapping key `stopPropagation`), and `pk-command-palette` now reports the chosen `id` in the `pk-select` detail, so `PkSelectEventArgs.Id` is filled (#1428). `PkSideNav` no longer lists `ShowAsync` and `HideAsync` in its mapping (use `Open`).
