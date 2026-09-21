---
type: notes
issue: 106
---
`node scripts/secret-scan.mjs [--history]` scans the tracked files, and with `--history` every line ever added on any branch, for credential-shaped text (private keys, GitHub, npm, NuGet, Slack, Google and AWS keys, JWTs, connection strings, URLs with passwords) and prints masked hits; a test keeps the tree clean. The audit's history scan found nothing.
