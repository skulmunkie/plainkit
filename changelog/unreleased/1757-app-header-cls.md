---
type: fixed
issue: 1757
---
The app header no longer shifts when the module picker or the search field upgrades after the first paint: before they upgrade, the picker shows only its trigger and the search field keeps the size it will have, so the header does not reflow on a slow machine.
