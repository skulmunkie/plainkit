---
type: changed
issue: 196
---
The SDK site's Files page no longer ships a 4.4 MB (975 KB gzip) embedded snapshot of `core/` up front. It fetches a lean file list (`site/files/index.json`, a few KB) and each file's real text same-origin, lazily, only once it's opened, searched or referenced-in (new `LazyProvider` in `core/modules/code-explorer/providers.js`) — `core/tests/*`, `core/tools/*` and `core/icons/*` (source, tests included) are now published on the Pages deploy for this. `SnapshotProvider` (the full embedded document) is unchanged and still generated (`site/files/snapshot.json`, `node core/tools/snapshot.mjs`) for anyone who wants everything in one request.
