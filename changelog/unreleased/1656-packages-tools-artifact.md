---
type: changed
issue: 1656
---
The release gains per-package downloads next to the full ones: `plainkit-<version>.zip` (core) and `plainkit.tools-<version>.zip` (the dev tools and the helper files only they use), each with its own manifest, and the Pages site serves the tools under `packages/plainkit.tools/`. `plainkit-dist-<version>.zip` and `dist/` stay the full shape with every path unchanged, so nothing you load today moves. The core package size ceilings come back down (850,000 packed, 3,185,000 unpacked) because the 33 tool-only helper files left core.
