---
type: removed
---
The npm package no longer ships `dist/llms-full.txt` (1.3 MB, 350 KB packed), a plain concatenation of the files already in `dist/skills/`; the tarball drops from 1.75 MB to 1.40 MB packed. It stays on the Pages site and in the release assets, and `dist/llms.txt` names it without a link. Consumers that read node_modules/plainkit/dist/llms-full.txt directly should fetch it from the Pages site or the release assets, or read the same content in dist/skills/. No documented entry point maps to it.
