---
type: notes
issue: 616
---
Internal: the conformance audit's element, token and page-type hint data (design docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md) is now generated at build time from element meta, `core/js/app/pages/*.js` and `core/tokens/tokens.css`, replacing the hand-written placeholder tables added in #612. Element meta gains an optional `replaces` field (native tags/roles/APIs an element replaces). No user-visible runtime behaviour changes; the audit rules that consume this data are not built yet.
