---
type: added
issue: 336
---
`pk-tray` is a persistent, non-modal tool panel pinned to a viewport edge (`edge`: bottom, top, start or end) with a floating launcher, a small, medium or large size choice (`size`, `sizes`) and an optional keyboard chord (`hotkey`, such as Ctrl+`). It has no backdrop and no focus trap, so the page behind stays usable; Escape inside it, Close and the launcher close it and return focus to the launcher. `PkTray` is its Blazor component. Choose `pk-drawer` for a modal panel, `pk-dock` for panels arranged inside a page, and `pk-tray` for a tool panel over a page.
