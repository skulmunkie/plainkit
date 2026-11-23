---
type: changed
issue: 107
---
The theme editor reads and writes one versioned theme document (`{ version, shared, dark, light }`) for pasted JSON, share links, saved themes and the `plainkit.custom.json` settings file; older JSON, CSS blocks and settings files still import, and a document from a newer version is refused with a message.
