---
type: added
issue: 398
---
The theme editor's generic undo/redo stack is now a standalone utility, `js/history.js` (`createHistory`, `record`, `undo`, `redo`, `canUndo`, `canRedo`, `MAX_STEPS`, `COALESCE_MS`), for any consumer app that wants coalesced, capped undo/redo over its own structured state; `js/theme-history-logic.js` is now a thin consumer of it.
