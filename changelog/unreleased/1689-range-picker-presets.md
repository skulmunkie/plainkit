---
type: added
issue: 1689
---
`pk-date-range-picker` offers the quick ranges `quarter`, `lastquarter` and `lastyear`, and takes your own named presets as `presetItems` (`[{ key, label, start, end }]`; Blazor: `PkDateRangePicker.PresetItems` of `PkDatePreset`). `pk-range-change` reports the key of the matching preset as `preset` (Blazor: `Preset` on the event args), so a named period can be stored and re-resolved later.
