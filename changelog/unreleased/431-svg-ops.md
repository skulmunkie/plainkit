---
type: added
issue: 431
---
The SVG toolkit gains its document operations (`js/svg/ops.js`, pure, no element yet): insert, remove, move (keeping the look through group transforms), group, ungroup (the group's transform and inherited look are baked into its children), reorder, transform and setAttrs. Each returns a new document that shares every untouched node with the old one, the ids it acted on, the problems it found and a history key, so results go straight into the shared undo history; nothing ever breaks the model's limits.
