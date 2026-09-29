---
type: fixed
issue: 135
---
The gallery's Elements overview no longer jumps its card grid into columns after the page has already painted: `pk-grid` reserves its column layout before it upgrades, removing the dominant remaining layout shift on that route.
