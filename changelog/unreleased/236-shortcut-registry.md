---
type: changed
issue: 236
---
Plainkit's global trigger shortcuts (Ctrl/Cmd+K for the command palette, Shift+F10/ContextMenu for the context menu) now come from one
command-verb registry (`js/shortcuts.js`, `isShortcut(verb, event, overrides)`) instead of being checked inline in each element; the
`search-results` sample pattern imports the shared check instead of duplicating it. No behavior changes for existing pages.
