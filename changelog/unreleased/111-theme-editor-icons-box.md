---
type: added
issue: 111
---
The theme editor Custom SDK tab has an "Icon sprite" box, ticked by default: untick it to leave `icons.svg`, `icons.json` and `icons.d.ts` out of a custom export when the page draws no icons (the settings file records `include.icons: false` and imports it back).
