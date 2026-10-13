---
type: fixed
issue: 1261
---
The theme editor sample swatches take their colours from one adopted stylesheet instead of style attributes, so they no longer trip the literal-colour check; the sheet is removed when the editor is destroyed.
