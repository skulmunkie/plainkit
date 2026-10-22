---
type: changed
issue: 1656
---
The release gains `plainkit.dock-<version>.zip` (with its own manifest, and the Pages folder `packages/plainkit.dock/`): `pk-dock` and its `js/dock-*.js` files, which need core at the exact same version. A lean setup unzips it over the core folder; `plainkit-dist-<version>.zip` and `dist/` keep every old path, so nothing you load today moves, and core alone no longer has `<pk-dock>`. The core package ceilings come down (587,500 packed, 2,312,400 unpacked), freeing about 12.7 KB packed for core.
