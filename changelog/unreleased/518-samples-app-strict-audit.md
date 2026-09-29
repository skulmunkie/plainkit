---
type: fixed
issue: 518
---
`core/samples/app`'s Orders module uses the built-in `list` and `record` page types instead of hand-built table/detail views, so `npx plainkit audit --strict` now passes cleanly on the SDK's own reference app. The allow-list ratchet (`describeAllow`/`checkFiles`) no longer reports an `allow` entry as dead when its file was outside the current run's scan, so a shared `plainkit.audit.json` at a monorepo root does not fail unrelated narrower audit runs.
