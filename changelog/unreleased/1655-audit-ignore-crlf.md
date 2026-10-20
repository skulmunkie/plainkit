---
type: fixed
issue: 1655
---
The audit CLI detects plainkit-audit-ignore comments in files with CRLF line endings, so inline suppressions and --list-suppressions behave the same on every checkout.
