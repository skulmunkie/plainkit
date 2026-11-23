---
type: fixed
issue: 111
---
The custom SDK export keeps the icon sprite (`icons.svg`, `icons.json`, `icons.d.ts`, listed in the extras manifest since the icons became their own package) and can leave it out with `include.icons: false` in `plainkit.custom.json`; `bundle-page.mjs --no-icons` omits `plainkit-icons.svg` from a `--flat` bundle. The default output is unchanged.
