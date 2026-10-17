---
type: added
issue: 1519
---
`plainkit audit` has three opt-in safe fixes, each previewable with `--dry-run` (a diff, nothing written): `--fix D1-simple` rewrites `<hr>` and an empty `<progress value max>` to `<pk-divider>` and `<pk-progress>`, `--fix A1-label` adds `label` to an icon-only `<pk-button>` from its static `title`, and `--update-allow` removes dead allow entries and lowers stale counts in `plainkit.audit.json`.
