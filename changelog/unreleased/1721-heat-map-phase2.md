---
type: added
issue: 1721
---
`pk-heat-map` phase 2: `layout="rows"` (`Layout`) keeps the input order so positions stay put while live values change; `scale="intensity"` (`Scale`) shades one hue by each item's `intensity` from 0 to 1 and shows it as a percentage; `max-items` (`MaxItems`) keeps the top N and merges the rest into Other; `value-format` (`ValueFormat`: number, compact or share) changes how a value reads; `pk-heat-focus-item` (`OnFocusItem`) reports the focused box; value changes animate only when the user allows motion. The merged Other box now takes the most serious severity of what it holds. No tile is a thin strip any more: a box that cannot be merged away is given just enough area to reach `min-box` (so on a phone the touch target holds), and a tile too narrow for its text shows only its number, with the label and status kept in its name and tooltip.
