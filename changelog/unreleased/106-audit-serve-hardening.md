---
type: fixed
issue: 106
---
The development server (`core/tools/serve.mjs`) no longer serves files from a sibling folder that shares the SDK folder's name prefix, answers a malformed percent escape with 400 instead of crashing, listens on the loopback address only (`--host=` opts out), answers only local Host names (DNS rebinding) and accepts a `--write-reports` POST only from its own origin, so another web page can no longer overwrite the browser attestation.
