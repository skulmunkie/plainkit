---
type: added
issue: 1908
---
`pk-tray` takes `launcher-variant="icon"` (Blazor `LauncherVariant`): the launcher becomes a bare circle around the icon in its `launcher` slot, transparent while the tray is closed and filled while it is open, named by `launcher-label`. `--pk-tray-launcher-inset-block-end`, `--pk-tray-launcher-inset-inline-end` and `--pk-tray-launcher-padding` move and size it. `pk-button` size `mini` now honours `--pk-button-padding` (it ignored it before).
