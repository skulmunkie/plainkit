---
type: added
issue: 591
---
`js/shortcuts.js` gains a shared registry for an element's own keyboard chords (`registerChord`/`dispatchChord`, alongside the existing command-verb `isShortcut`): register in `connected()`, unregister in `disconnected()`, one shared `keydown` listener instead of one per element instance, and a development warning when two currently-registered handlers claim the same chord.
