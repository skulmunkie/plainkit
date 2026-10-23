---
type: added
issue: 1721
---
`pk-heat-map` (Blazor `PkHeatMap`), phase 1 of the weighted treemap: a fixed-height area filled with boxes whose area is each item's `value` and whose colour is its `severity` (neutral, info, success, warning, danger), laid out by a squarified treemap that tiles the area exactly and relays out when it resizes. Boxes are real links (with `href`) or buttons, with one tab stop and arrow-key movement; a data table is always kept for assistive technology and `show-table` (`ShowTable`) shows it in place of the map. Boxes narrower than `min-box` (`MinBox`) merge into one "Other (n)" box; `pk-heat-select` (`OnSelect`) reports the activated item. It ships in the `plainkit.canvas` package, not in core. Grouping, the intensity scale and `max-items` follow in later phases.
