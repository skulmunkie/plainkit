---
type: changed
issue: 1656
---
The release gains `plainkit.canvas-<version>.zip` (with its own manifest, and the Pages folder `packages/plainkit.canvas/`): `pk-canvas`, its viewport and logic helpers and the SVG toolkit `js/svg/`, which need core at the exact same version. A lean setup unzips it over the core folder; `plainkit-dist-<version>.zip` and `dist/` keep every old path until 0.22, so nothing you load today moves, and core alone no longer has `<pk-canvas>`. The core package ceilings come down again (845,000 packed, 3,177,000 unpacked).
