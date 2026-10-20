---
type: changed
issue: 1656
---
The release gains `plainkit.markdown-<version>.zip` (with its own manifest, and the Pages folder `packages/plainkit.markdown/`): `pk-markdown`, `pk-markdown-editor` and the Markdown parser, renderer and editing commands `js/markdown/`, which need core at the exact same version. A lean setup unzips it over the core folder; `plainkit-dist-<version>.zip` and `dist/` keep every old path until 0.22, so nothing you load today moves, and core alone no longer has `<pk-markdown>` or `<pk-markdown-editor>`. The core package ceilings come down again (597,500 packed, 2,343,100 unpacked).
