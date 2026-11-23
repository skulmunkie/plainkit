---
type: fixed
issue: 111
---
The icon sprite now enforces its 2px safe margin: a test fails when a circle, line, rect, polyline or polygon in `core/icons/src/` reaches outside the 2..22 range of the 24px grid, and `refresh`, `eye-off`, `finance` and `stock` are redrawn inside it so no stroke clips at the 16px size.
