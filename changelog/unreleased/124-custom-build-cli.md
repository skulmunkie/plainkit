---
type: added
issue: 124
---
`node scripts/custom-build.mjs --config plainkit.custom.json` builds the custom SDK zip from the command line, byte for byte what the theme editor exports (same settings file, same functions); `--dist`, `--out` and `--check` are the other flags, and a bad config fails with one line and exit code 1.
