---
type: fixed
issue: 1326
---
A Gallery element page ends its timers and frame callbacks when you leave it, so a closed or destroyed gallery no longer keeps the page's tabs alive for up to three seconds.
