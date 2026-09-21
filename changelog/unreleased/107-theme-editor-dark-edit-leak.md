---
type: fixed
issue: 107
---
The theme editor no longer lets a dark-theme edit show in the light theme. The dark overrides are written under `:root`, which also matches the page in the light theme and comes after the stylesheet's light block, so a token edited only for dark (or generated with a light value equal to the stylesheet's) took the dark value in light as well. The output (the applied stylesheet, `export()`, the snippet) now carries the stylesheet's own light value for every dark-only edit; the edits, the change list and the JSON stay as the user made them.
