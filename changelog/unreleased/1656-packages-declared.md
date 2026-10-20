---
type: notes
issue: 1656
---
A new `packages.json` declares which release package (core, `plainkit.tools`, `plainkit.markdown`, `plainkit.dock`, `plainkit.canvas`) owns every shipped file, and an element meta may carry an optional `package` id. Nothing moves yet: a test checks that every file has one owner and that core never imports an extra.
