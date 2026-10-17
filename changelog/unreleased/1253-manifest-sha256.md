---
type: changed
issue: 1253
---
The integrity hashes in `dist/manifest.json` (and the modules manifest, the theme editor's custom SDK export and `PkAssets.Integrity`) are now `sha256-...` instead of `sha384-...`: still valid Subresource Integrity values, and the npm package is about 8.8 KB smaller packed. Pin `integrity="sha256-..."` from the manifest as before; nothing else changes.
