---
type: added
issue: 518
---
`plainkit audit` gains the allow-list ratchet report (a stale or dead `allow` entry now fails the run with a FIX line, instead of being silently honoured), `--baseline`/`--update-baseline`/`--strict-baseline` for adopting the audit on an existing app with CI green from day one, and `--format sarif` for GitHub code scanning.
