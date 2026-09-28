---
type: added
issue: 332
---
Adds `pk-kanban` and `pk-kanban-column`: a board whose cards (`pk-sortable-item`, usually holding a `pk-card`) drag between columns by pointer or touch, or move with Alt+Arrow keys, announced in a live region. The move is reported by a cancelable `pk-move` event and applied by the host; Blazor gets `PkKanban`, `PkKanbanColumn` and `PkMoveEventArgs`.
