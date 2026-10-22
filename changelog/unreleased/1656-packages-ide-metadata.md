---
type: changed
issue: 1656
---
The editor and IDE metadata (`elements.d.ts`, `elements.vue.d.ts`, `custom-elements.json`, `web-types.json`, `vscode.html-custom-data.json`, about 890 KB) is now the package `plainkit.ide`: `plainkit.ide-<version>.zip` (with its own manifest), the Pages folder `packages/plainkit.ide/`, and still part of the full `plainkit-dist-<version>.zip` and `dist/`, so no path moves there. The npm package no longer carries these files, and its `exports` entries `plainkit/custom-elements.json` and `plainkit/web-types.json` are gone with them; take the files from the zip or the Pages folder. Core's npm size drops from 586,151 to 402,675 bytes packed (2,312,345 to 1,419,663 unpacked), and the core ceilings come down to 406,700 and 1,433,900.
