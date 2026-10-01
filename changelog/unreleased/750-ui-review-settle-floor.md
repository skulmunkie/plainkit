---
type: changed
issue: 750
---
The UI review scenarios wait for the page's own short timers (a debounce, a hover delay) to fire instead of a fixed 150 ms after every step, which cut 14 sampled scenarios from 282 s to 174 s with the same screenshots and findings.
