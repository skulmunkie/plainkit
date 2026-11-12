---
type: added
issue: 1941
---
pk-tray launcher-variant="none" draws no floating launcher: the tray opens from a control the page already has (data-toggle or data-open, as on pk-drawer), and every such opener gets aria-expanded, aria-controls (when the tray has an id) and the hotkey in its title. PkTray LauncherVariant gains None.
