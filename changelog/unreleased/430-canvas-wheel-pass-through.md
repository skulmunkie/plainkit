---
type: changed
issue: 430
---
`pk-canvas` no longer takes the plain mouse wheel from the page: the new `wheel` attribute defaults to `auto`, so the wheel scrolls the page (a canvas in a long page no longer traps it) and pans only while the canvas has focus; Ctrl or Cmd with the wheel and a trackpad pinch still zoom, always. To keep the old behaviour (the plain wheel always pans) set `wheel="pan"` (Blazor `Wheel="pan"`); `zoom` zooms with the plain wheel and `page` never takes it. Also new: `zoomToFit(rect?)`, `zoomTo(zoom, anchor?)` and `centerOn(x, y)` (Blazor `ZoomToFitAsync`, `CenterOnAsync`), the 1 and Home keys fit the content, zoom changes are announced in a live region, and Left and Right pan follow the reading direction in right-to-left pages. `pk-canvas` now shares its view maths with `js/viewport-logic.js`, which gains `toOrigin`, `fromOrigin`, `zoomToFit` and `centerOn`.
