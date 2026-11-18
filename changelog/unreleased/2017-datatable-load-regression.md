---
type: fixed
issue: 2017
---
pk-data-table: an explicit `refresh()` right after an option change no longer runs a second, deferred load that cancelled it (a first-load error never showed), and a columns change while no row is drawn yet (the first load came back empty or failed) loads again, as before, so a list page whose config arrives after it connects shows its rows or its error. A columns change over drawn rows still only redraws. The removed-`config` warning is shorter.
