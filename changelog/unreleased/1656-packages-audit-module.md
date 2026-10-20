---
type: changed
issue: 1656
---
The conformance audit CLI is now its own module, `plainkit.audit`: `plainkit.audit-<version>.zip` on the release and the Pages folder `packages/plainkit.audit/` (no npm package). Unzip it and run `node audit.mjs <path>` (Node 18 or newer); `plainkit.tools` requires it. The npm package `plainkit` no longer carries the CLI, so its `bin` now prints where to get the module, and the core package gets smaller. The full `plainkit-dist` zip and `dist/` still hold every file at its old path.
