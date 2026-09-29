---
type: added
issue: 629
---
Adds `npx plainkit audit [paths...]`, a CLI that scans a consumer app's own source for PlainKit conformance issues (duplicating an element or its interaction logic today; `--strict` promotes the strict-module rules to errors). Supports `--format text|json`, `--rule`/`--skip`, `--config`, `--max-warnings`, `--explain`, `--list-rules` and `plainkit.audit.json` config discovery.
